// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import "./SettlementBase.sol";

interface IPonsV1 {
    struct Launch {
        address token;
        address deployer;
        address pairedToken;
        address positionManager;
        uint256 positionId;
        uint256 dexId;
        uint256 launchConfigId;
        uint256 restrictionsEndBlock;
        uint256 supply;
        bool isToken0;
        uint24 poolFee;
        bool exists;
        uint256 initialBuyAmount;
    }
    function getLaunchedToken(address) external view returns (Launch memory);
}
interface IPonsV2 {
    struct Launch {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }
    function getLaunchedToken(address) external view returns (Launch memory);
    function poolManager() external view returns (address);
    function memeHook() external view returns (address);
}
interface IPonsCurve {
    function token() external view returns (address);
    function factory() external view returns (address);
    function pairToken() external view returns (address);
    function graduated() external view returns (bool);
    function readyToGraduate() external view returns (bool);
    function buy(uint256, uint256, address) external payable returns (uint256);
    function sell(uint256, uint256, address) external returns (uint256);
}
interface IPonsToken {
    function liquidityPool() external view returns (address);
}
interface IV4Manager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }
    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }
    function unlock(bytes calldata) external returns (bytes memory);
    function swap(
        PoolKey calldata,
        SwapParams calldata,
        bytes calldata
    ) external returns (int256);
    function sync(address) external;
    function settle() external payable returns (uint256);
    function take(address, address, uint256) external;
}

/// @notice Native-ETH PONS markets only. No arbitrary call targets or owner withdrawals.
contract TradeSettlement is SettlementBase {
    address public constant V1 =
        address(bytes20(hex"a5aab3f0c6eeadf30ef1d3eb997108e976351feb"));
    address public constant V1_LEGACY =
        address(bytes20(hex"0c37a24f5d23a486fa692d1500881d698b1f77a4"));
    address public constant V2 =
        address(bytes20(hex"7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"));
    address public constant WRAPPED =
        address(bytes20(hex"0bd7d308f8e1639fab988df18a8011f41eacad73"));
    address public constant V3_FACTORY =
        address(bytes20(hex"1f7d7550b1b028f7571e69a784071f0205fd2efa"));
    address public constant V3_ROUTER =
        address(bytes20(hex"caf681a66d020601342297493863e78c959e5cb2"));
    address public constant V4_MANAGER =
        address(bytes20(hex"8366a39cc670b4001a1121b8f6a443a643e40951"));
    address public constant V4_HOOK =
        address(bytes20(hex"e5e702641ea86f4ae6cc3cdaed2b886f976be044"));
    bytes32 private callbackHash;

    function stage(
        address token
    ) public view override returns (uint8, address, uint24) {
        // Refuse changed factory bytecode rather than trusting an unreviewed protocol update.
        if (
            V1.codehash !=
            hex"0a62b8ed1d88d30c7b342ea8361dfaf0ac336706992cf0c8ba38b129f06391d4" ||
            V1_LEGACY.codehash !=
            hex"921a0d1b2d854de5435804e8ee118658f05173a0eeebca5f41b41385b97cd1b5" ||
            V2.codehash !=
            hex"89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84"
        ) revert UnsupportedMarket();
        IPonsV1.Launch memory a = IPonsV1(V1).getLaunchedToken(token);
        IPonsV1.Launch memory b = IPonsV1(V1_LEGACY).getLaunchedToken(token);
        IPonsV2.Launch memory c = IPonsV2(V2).getLaunchedToken(token);
        if ((a.exists ? 1 : 0) + (b.exists ? 1 : 0) + (c.exists ? 1 : 0) != 1)
            revert UnsupportedMarket();
        if (c.exists) {
            if (c.token != token || c.pairToken != address(0))
                revert UnsupportedMarket();
            IPonsCurve curve = IPonsCurve(c.curve);
            if (
                curve.token() != token ||
                curve.factory() != V2 ||
                curve.pairToken() != address(0)
            ) revert UnsupportedMarket();
            if (c.phase == 0 && !curve.graduated() && !curve.readyToGraduate())
                return (0, c.curve, 0);
            if (
                c.phase != 2 ||
                !curve.graduated() ||
                IPonsV2(V2).poolManager() != V4_MANAGER ||
                IPonsV2(V2).memeHook() != V4_HOOK
            ) revert UnsupportedMarket();
            return (2, V4_MANAGER, c.poolFee);
        }
        IPonsV1.Launch memory r = a.exists ? a : b;
        if (r.token != token || r.pairedToken != WRAPPED)
            revert UnsupportedMarket();
        address pool = IPonsToken(token).liquidityPool();
        if (
            pool == address(0) ||
            IV3Factory(V3_FACTORY).getPool(token, WRAPPED, r.poolFee) != pool ||
            IV3Pool(pool).factory() != V3_FACTORY ||
            IV3Pool(pool).fee() != r.poolFee ||
            IV3Pool(pool).token0() != (r.isToken0 ? token : WRAPPED) ||
            IV3Pool(pool).token1() != (r.isToken0 ? WRAPPED : token)
        ) revert UnsupportedMarket();
        return (1, pool, r.poolFee);
    }

    function _buy(
        address token,
        uint8 venue,
        address market,
        uint24 tier,
        uint256 amount,
        address recipient,
        uint256
    ) internal override {
        if (venue == 0)
            IPonsCurve(market).buy{value: amount}(amount, 0, recipient);
        else if (venue == 1) {
            uint256 beforeWrapped = IERC20(WRAPPED).balanceOf(address(this));
            IWrapped(WRAPPED).deposit{value: amount}();
            _approve(WRAPPED, V3_ROUTER, amount);
            IV3Router(V3_ROUTER).exactInputSingle(
                IV3Router.ExactInputSingleParams(
                    WRAPPED,
                    token,
                    tier,
                    recipient,
                    amount,
                    0,
                    0
                )
            );
            _approve(WRAPPED, V3_ROUTER, 0);
            // V3 can stop at its price boundary; return unused input to the buyer.
            uint256 unspent = IERC20(WRAPPED).balanceOf(address(this)) -
                beforeWrapped;
            if (unspent > 0) IWrapped(WRAPPED).withdraw(unspent);
        } else if (venue == 2) _v4(token, true, amount, recipient);
        else revert UnsupportedMarket();
    }
    function _sell(
        address token,
        uint8 venue,
        address market,
        uint24 tier,
        uint256 amount,
        uint256
    ) internal override {
        if (venue == 0) {
            _approve(token, market, amount);
            IPonsCurve(market).sell(amount, 0, address(this));
            _approve(token, market, 0);
        } else if (venue == 1) {
            uint256 beforeWrapped = IERC20(WRAPPED).balanceOf(address(this));
            _approve(token, V3_ROUTER, amount);
            IV3Router(V3_ROUTER).exactInputSingle(
                IV3Router.ExactInputSingleParams(
                    token,
                    WRAPPED,
                    tier,
                    address(this),
                    amount,
                    0,
                    0
                )
            );
            _approve(token, V3_ROUTER, 0);
            IWrapped(WRAPPED).withdraw(
                IERC20(WRAPPED).balanceOf(address(this)) - beforeWrapped
            );
        } else if (venue == 2) _v4(token, false, amount, address(this));
        else revert UnsupportedMarket();
    }
    function _v4(
        address token,
        bool buying,
        uint256 amount,
        address recipient
    ) internal {
        IPonsV2.Launch memory r = IPonsV2(V2).getLaunchedToken(token);
        IV4Manager.PoolKey memory key = IV4Manager.PoolKey(
            address(0),
            token,
            r.poolFee,
            r.tickSpacing,
            V4_HOOK
        );
        bytes memory data = abi.encode(key, buying, amount, recipient);
        if (callbackHash != bytes32(0)) revert Reentered();
        callbackHash = keccak256(data);
        IV4Manager(V4_MANAGER).unlock(data);
        if (callbackHash != bytes32(0)) revert AmountMismatch();
    }
    function unlockCallback(
        bytes calldata data
    ) external returns (bytes memory) {
        if (
            msg.sender != V4_MANAGER ||
            callbackHash == bytes32(0) ||
            keccak256(data) != callbackHash
        ) revert InvalidRequest();
        callbackHash = bytes32(0);
        (
            IV4Manager.PoolKey memory key,
            bool buying,
            uint256 amount,
            address recipient
        ) = abi.decode(data, (IV4Manager.PoolKey, bool, uint256, address));
        if (amount > uint256(type(int256).max)) revert InvalidRequest();
        int256 delta = IV4Manager(V4_MANAGER).swap(
            key,
            IV4Manager.SwapParams(
                buying,
                -int256(amount),
                buying
                    ? uint160(4295128740)
                    : uint160(1461446703485210103287273052203988822378723970341)
            ),
            ""
        );
        int128 nativeDelta = int128(delta >> 128);
        int128 tokenDelta = int128(delta);
        int128 inputDelta = buying ? nativeDelta : tokenDelta;
        int128 outputDelta = buying ? tokenDelta : nativeDelta;
        if (
            inputDelta >= 0 ||
            outputDelta <= 0 ||
            uint256(-int256(inputDelta)) > amount
        ) revert AmountMismatch();
        // Sells must use the full requested token input; buys can refund unused native currency.
        if (!buying && uint256(-int256(inputDelta)) != amount)
            revert AmountMismatch();
        _settle(key.currency0, nativeDelta, recipient);
        _settle(key.currency1, tokenDelta, recipient);
        return "";
    }
    function _settle(
        address currency,
        int128 delta,
        address recipient
    ) private {
        IV4Manager manager = IV4Manager(V4_MANAGER);
        if (delta < 0) {
            uint256 owed = uint256(-int256(delta));
            manager.sync(currency);
            if (currency == address(0)) {
                if (manager.settle{value: owed}() != owed)
                    revert AmountMismatch();
            } else {
                _token(
                    currency,
                    abi.encodeCall(IERC20.transfer, (V4_MANAGER, owed))
                );
                if (manager.settle() != owed) revert AmountMismatch();
            }
        } else if (delta > 0)
            manager.take(currency, recipient, uint256(int256(delta)));
    }
}
