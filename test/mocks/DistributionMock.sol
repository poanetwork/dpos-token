pragma solidity 0.5.10;

import "../../contracts/Distribution.sol";

contract DistributionMock is Distribution {
    constructor(
        uint256 _stakingEpochDuration,
        address _ecosystemFundAddress,
        address _publicOfferingAddress,
        address _privateOfferingAddress,
        address _foundationAddress,
        address _exchangeRelatedActivitiesAddress
    ) Distribution(
        _stakingEpochDuration,
        _ecosystemFundAddress,
        _publicOfferingAddress,
        _privateOfferingAddress,
        _foundationAddress,
        _exchangeRelatedActivitiesAddress
    ) public {} // solium-disable-line

    function setToken(address _tokenAddress) external {
        token = IERC677BridgeToken(_tokenAddress);
    }

    function transferTokens(address _to, uint256 _value) external {
        token.transfer(_to, _value);
    }

    function initializePrivateOfferingDistribution() external {
        IPrivateOfferingDistribution(poolAddress[PRIVATE_OFFERING]).initialize(address(token));
    }
}
