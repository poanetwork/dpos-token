pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/utils/Address.sol";
import "./ERC20.sol";
import "./IERC677BridgeToken.sol";
import "./Sacrifice.sol";
import "../IDistribution.sol";

contract ERC677BridgeToken is Ownable, IERC677BridgeToken, ERC20, ERC20Detailed {
    using SafeERC20 for ERC20;
    using Address for address;

    ///  @dev Bridge contract address
    address public bridgeContract;
    ///  @dev Distribution contract address
    address public distributionAddress;
    ///  @dev The first PrivateOfferingDistribution contract address
    address public privateOfferingDistributionAddress_1;
    ///  @dev The second PrivateOfferingDistribution contract address
    address public privateOfferingDistributionAddress_2;

    /// @dev Modified Transfer event with custom data
    /// @param from From address
    /// @param to To address
    /// @param value Transferred value
    /// @param data Custom data to call after transfer
    event Transfer(address indexed from, address indexed to, uint256 value, bytes data);

    /// @dev Emits if custom call after transfer fails
    /// @param from From address
    /// @param to To address
    /// @param value Transferred value
    event ContractFallbackCallFailed(address from, address to, uint256 value);

    /// @dev Creates a token and mints the whole supply for the Distribution contract
    /// @param _name Token name
    /// @param _symbol Token symbol
    /// @param _distributionAddress The address of the deployed Distribution contract
    /// @param _privateOfferingDistributionAddress_1 The address of the first PrivateOfferingDistribution contract
    /// @param _privateOfferingDistributionAddress_2 The address of the second PrivateOfferingDistribution contract
    constructor(
        string memory _name,
        string memory _symbol,
        address _distributionAddress,
        address _privateOfferingDistributionAddress_1,
        address _privateOfferingDistributionAddress_2
    ) ERC20Detailed(_name, _symbol, 18) public {
        require(_distributionAddress.isContract(), "not a contract address");
        require(
            _privateOfferingDistributionAddress_1.isContract() &&
            _privateOfferingDistributionAddress_2.isContract(),
            "not a contract address"
        );
        uint256 supply = IDistribution(_distributionAddress).supply();
        require(supply > 0, "the supply must be more than 0");
        _mint(_distributionAddress, supply);
        distributionAddress = _distributionAddress;
        privateOfferingDistributionAddress_1 = _privateOfferingDistributionAddress_1;
        privateOfferingDistributionAddress_2 = _privateOfferingDistributionAddress_2;
    }

    /// @dev Checks that the recipient address is valid
    /// @param _recipient Recipient address
    modifier validRecipient(address _recipient) {
        require(_recipient != address(0) && _recipient != address(this), "not a valid recipient");
        _;
    }

    /// @dev Extends transfer method with callback
    /// @param _to The address of the recipient
    /// @param _value The value to transfer
    /// @param _data Custom data
    /// @return Success status
    function transferAndCall(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external validRecipient(_to) returns (bool) {
        _superTransfer(_to, _value);
        emit Transfer(msg.sender, _to, _value, _data);

        if (_to.isContract()) {
            require(_contractFallback(msg.sender, _to, _value, _data), "contract call failed");
        }
        return true;
    }

    /// @dev Sets the bridge contract address
    /// @param _bridgeContract The address of the bridge contract
    function setBridgeContract(address _bridgeContract) public onlyOwner {
        require(_bridgeContract != address(0) && _bridgeContract.isContract(), "wrong address");
        bridgeContract = _bridgeContract;
    }

    /// @dev Extends transfer method with event when the callback failed
    /// @param _to The address of the recipient
    /// @param _value The value to transfer
    /// @return Success status
    function transfer(address _to, uint256 _value) public returns (bool) {
        _superTransfer(_to, _value);
        _callAfterTransfer(msg.sender, _to, _value);
        return true;
    }

    /// @dev This is a copy of `transfer` function which can only be called by the `Distribution` contract. Made to get rid of `onTokenTransfer` calling to save gas when distributing tokens.
    /// @param _to The address of the recipient
    /// @param _value The value to transfer
    /// @return Success status
    function transferDistribution(address _to, uint256 _value) public returns (bool) {
        require(
            msg.sender == distributionAddress ||
            msg.sender == privateOfferingDistributionAddress_1 ||
            msg.sender == privateOfferingDistributionAddress_2,
            "wrong sender"
        );
        _superTransfer(_to, _value);
        return true;
    }

    /// @dev Extends transferFrom method with event when the callback failed
    /// @param _from The address of the sender
    /// @param _to The address of the recipient
    /// @param _value The value to transfer
    /// @return Success status
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        _superTransferFrom(_from, _to, _value);
        _callAfterTransfer(_from, _to, _value);
        return true;
    }

    /// @dev If someone sent eth/tokens to the contract mistakenly then the owner can send them back
    /// @param _token The token address to transfer
    /// @param _to The address of the recipient
    function claimTokens(address _token, address payable _to) public onlyOwner validRecipient(_to) {
        if (_token == address(0)) {
            uint256 value = address(this).balance;
            if (!_to.send(value)) { // solium-disable-line security/no-send
                // We use the `Sacrifice` trick to be sure the coins can be 100% sent to the receiver.
                // Otherwise, if the receiver is a contract which has a revert in its fallback function,
                // the sending will fail.
                (new Sacrifice).value(value)(_to);
            }
        } else {
            ERC20 token = ERC20(_token);
            uint256 balance = token.balanceOf(address(this));
            token.safeTransfer(_to, balance);
        }
    }

    /// @dev The removed implementation of the ownership renouncing
    function renounceOwnership() public onlyOwner {
        revert("not implemented");
    }

    /// @dev Calls transfer method and reverts if it fails
    /// @param _to The address of the recipient
    /// @param _value The value to transfer
    function _superTransfer(address _to, uint256 _value) internal {
        bool success;
        if (
            msg.sender == privateOfferingDistributionAddress_1 ||
            msg.sender == privateOfferingDistributionAddress_2
        ) {
            // Allow sending tokens to `address(0)` by the PrivateOfferingDistribution contract
            _balances[msg.sender] = _balances[msg.sender].sub(_value);
            _balances[_to] = _balances[_to].add(_value);
            emit Transfer(msg.sender, _to, _value);
            success = true;
        } else {
            success = super.transfer(_to, _value);
        }
        require(success, "transfer failed");
    }

    /// @dev Calls transferFrom method and reverts if it fails
    /// @param _from The address of the sender
    /// @param _to The address of the recipient
    /// @param _value The value to transfer
    function _superTransferFrom(address _from, address _to, uint256 _value) internal {
        bool success = super.transferFrom(_from, _to, _value);
        require(success, "transfer failed");
    }

    /// @dev Emits an event when the callback failed
    /// @param _from The address of the sender
    /// @param _to The address of the recipient
    /// @param _value The transferred value
    function _callAfterTransfer(address _from, address _to, uint256 _value) internal {
        if (_to.isContract() && !_contractFallback(_from, _to, _value, new bytes(0))) {
            require(_to != bridgeContract, "you can't transfer to bridge contract");
            require(_to != distributionAddress, "you can't transfer to Distribution contract");
            require(_to != privateOfferingDistributionAddress_1, "you can't transfer to PrivateOfferingDistribution contract");
            require(_to != privateOfferingDistributionAddress_2, "you can't transfer to PrivateOfferingDistribution contract");
            emit ContractFallbackCallFailed(_from, _to, _value);
        }
    }

    /// @dev Makes a callback after the transfer of tokens
    /// @param _from The address of the sender
    /// @param _to The address of the recipient
    /// @param _value The transferred value
    /// @param _data Custom data
    /// @return Success status
    function _contractFallback(
        address _from,
        address _to,
        uint256 _value,
        bytes memory _data
    ) private returns (bool) {
        string memory signature = "onTokenTransfer(address,uint256,bytes)";
        // solium-disable-next-line security/no-low-level-calls
        (bool success, ) = _to.call(abi.encodeWithSignature(signature, _from, _value, _data));
        return success;
    }
}
