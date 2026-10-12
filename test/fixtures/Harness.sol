// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import "./SettlementBase.sol";
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public tax;
    function setTax(bool value) external {
        tax = value;
    }
    function mint(address user, uint256 amount) external {
        balanceOf[user] += amount;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += tax ? amount - 1 : amount;
        return true;
    }
}
contract MockVenue {
    function buy(address token, address recipient) external payable {
        MockToken(token).mint(recipient, msg.value * 100);
    }
    function sell(address token, uint256 amount) external {
        MockToken(token).transferFrom(msg.sender, address(this), amount);
        (bool ok, ) = payable(msg.sender).call{value: amount / 100}("");
        require(ok);
    }
    receive() external payable {}
}
contract Harness is SettlementBase {
    uint8 public currentStage;
    uint256 public fillBps = 10000;
    address constant VENUE = address(0x4000);
    function setStage(uint8 value) external {
        currentStage = value;
    }
    function setFill(uint256 value) external {
        fillBps = value;
    }
    function stage(
        address
    ) public view override returns (uint8, address, uint24) {
        return (currentStage, VENUE, 0);
    }
    function _buy(
        address token,
        uint8,
        address,
        uint24,
        uint256 amount,
        address user,
        uint256
    ) internal override {
        MockVenue(payable(VENUE)).buy{value: (amount * fillBps) / 10000}(
            token,
            user
        );
    }
    function _sell(
        address token,
        uint8,
        address,
        uint24,
        uint256 amount,
        uint256
    ) internal override {
        _approve(token, VENUE, amount);
        MockVenue(payable(VENUE)).sell(token, amount);
        _approve(token, VENUE, 0);
    }
}
contract RejectNative {
    receive() external payable {
        revert();
    }
}
contract ReenterNative {
    bool public blocked;
    receive() external payable {
        (bool ok, bytes memory data) = address(0x1000).call(
            abi.encodeWithSignature(
                "buy(address,uint256,uint256,uint256,uint8)",
                address(0x2000),
                1,
                60,
                25,
                0
            )
        );
        require(!ok && bytes4(data) == SettlementBase.Reentered.selector);
        blocked = true;
    }
}
