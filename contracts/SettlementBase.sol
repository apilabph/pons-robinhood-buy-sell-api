// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}
interface IWrapped is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}
interface IV2Factory {
    function getPair(address, address) external view returns (address);
}
interface IV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}
interface IV2Router {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256,
        address[] calldata,
        address,
        uint256
    ) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256,
        uint256,
        address[] calldata,
        address,
        uint256
    ) external;
}
interface IV3Factory {
    function getPool(address, address, uint24) external view returns (address);
}
interface IV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function fee() external view returns (uint24);
}
interface IV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(
        ExactInputSingleParams calldata
    ) external payable returns (uint256);
}

abstract contract SettlementBase {
    uint256 public constant FEE_BPS = 25;
    address public constant FEE_RECIPIENT =
        address(bytes20(hex"6a17d358ae138a726b4dda7a95c104440aadb2db"));
    uint256 public constant CHAIN_ID = 4663;
    uint256 private entered;
    error InvalidRequest();
    error WrongChain();
    error StageChanged();
    error UnsupportedMarket();
    error TokenTransferFailed();
    error AmountMismatch();
    error MinimumNotMet();
    error NativeTransferFailed();
    error Reentered();
    event Trade(
        address indexed user,
        address indexed token,
        bool buy,
        uint8 stage,
        uint256 inputUsed,
        uint256 output,
        uint256 serviceFee,
        uint256 refund
    );
    modifier locked() {
        if (entered == 2) revert Reentered();
        entered = 2;
        _;
        entered = 1;
    }
    receive() external payable {}
    function stage(
        address token
    ) public view virtual returns (uint8, address, uint24);
    function _buy(
        address token,
        uint8 venue,
        address market,
        uint24 tier,
        uint256 amount,
        address recipient,
        uint256 deadline
    ) internal virtual;
    function _sell(
        address token,
        uint8 venue,
        address market,
        uint24 tier,
        uint256 amount,
        uint256 deadline
    ) internal virtual;
    function _validate(
        uint256 amount,
        uint256 minimum,
        uint256 deadline,
        uint256 maxFee
    ) internal view {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (
            amount == 0 ||
            minimum == 0 ||
            deadline < block.timestamp ||
            deadline > block.timestamp + 300 ||
            maxFee < FEE_BPS ||
            msg.sender == FEE_RECIPIENT
        ) revert InvalidRequest();
    }
    function _send(address recipient, uint256 amount) internal {
        if (amount != 0) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        }
    }
    function _token(address token, bytes memory data) internal {
        (bool ok, bytes memory result) = token.call(data);
        if (
            !ok ||
            (result.length != 0 &&
                (result.length != 32 || !abi.decode(result, (bool))))
        ) revert TokenTransferFailed();
    }
    function _approve(address token, address spender, uint256 amount) internal {
        _token(token, abi.encodeCall(IERC20.approve, (spender, 0)));
        if (amount != 0)
            _token(token, abi.encodeCall(IERC20.approve, (spender, amount)));
    }
    function buy(
        address token,
        uint256 minimum,
        uint256 deadline,
        uint256 maxFee,
        uint8 expectedStage
    )
        external
        payable
        locked
        returns (uint256 output, uint256 fee, uint256 refund)
    {
        _validate(msg.value, minimum, deadline, maxFee);
        (uint8 venue, address market, uint24 tier) = stage(token);
        if (venue != expectedStage) revert StageChanged();
        uint256 baseNative = address(this).balance - msg.value;
        uint256 baseTokens = IERC20(token).balanceOf(msg.sender);
        // Fee is 0.25% of actual native input used by the protocol, within this total budget.
        uint256 swapBudget = (msg.value * 10000) / 10025;
        _buy(token, venue, market, tier, swapBudget, msg.sender, deadline);
        uint256 returned = address(this).balance - baseNative;
        if (returned > msg.value) revert AmountMismatch();
        uint256 spent = msg.value - returned;
        fee = (spent * FEE_BPS) / 10000;
        if (returned < fee) revert AmountMismatch();
        refund = returned - fee;
        output = IERC20(token).balanceOf(msg.sender) - baseTokens;
        if (output < minimum || spent == 0) revert MinimumNotMet();
        _send(FEE_RECIPIENT, fee);
        _send(msg.sender, refund);
        if (address(this).balance != baseNative) revert AmountMismatch();
        emit Trade(msg.sender, token, true, venue, spent, output, fee, refund);
    }
    function sell(
        address token,
        uint256 amount,
        uint256 minimum,
        uint256 deadline,
        uint256 maxFee,
        uint8 expectedStage
    ) external locked returns (uint256 output, uint256 fee) {
        _validate(amount, minimum, deadline, maxFee);
        (uint8 venue, address market, uint24 tier) = stage(token);
        if (venue != expectedStage) revert StageChanged();
        uint256 baseNative = address(this).balance;
        uint256 baseTokens = IERC20(token).balanceOf(address(this));
        _token(
            token,
            abi.encodeCall(
                IERC20.transferFrom,
                (msg.sender, address(this), amount)
            )
        );
        if (IERC20(token).balanceOf(address(this)) - baseTokens != amount)
            revert AmountMismatch();
        _sell(token, venue, market, tier, amount, deadline);
        if (IERC20(token).balanceOf(address(this)) != baseTokens)
            revert AmountMismatch();
        uint256 proceeds = address(this).balance - baseNative;
        fee = (proceeds * FEE_BPS) / 10000;
        output = proceeds - fee;
        if (output < minimum) revert MinimumNotMet();
        _send(FEE_RECIPIENT, fee);
        _send(msg.sender, output);
        if (address(this).balance != baseNative) revert AmountMismatch();
        emit Trade(msg.sender, token, false, venue, amount, output, fee, 0);
    }
}
