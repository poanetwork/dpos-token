const ERC677BridgeToken = artifacts.require('ERC677BridgeToken');
const EmptyContract = artifacts.require('EmptyContract');
const RecipientMock = artifacts.require('RecipientMock');
const TokenMock = artifacts.require('TokenMock');
const BridgeTokenMock = artifacts.require('BridgeTokenMock');
const DistributionMock = artifacts.require('DistributionMock');
const PrivateOfferingDistribution = artifacts.require('PrivateOfferingDistribution');

const { BN, toWei } = web3.utils;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bn')(BN))
    .should();


contract('Token', async accounts => {

    const {
        TOKEN_NAME,
        TOKEN_SYMBOL,
        EMPTY_ADDRESS,
        STAKING_EPOCH_DURATION,
        ECOSYSTEM_FUND,
        PUBLIC_OFFERING,
        FOUNDATION_REWARD,
        EXCHANGE_RELATED_ACTIVITIES,
        owner,
        address,
        SUPPLY,
        privateOfferingParticipants,
        privateOfferingParticipantsStakes,
    } = require('./constants')(accounts);

    let token;
    let bridge;
    let recipient;
    let distribution;
    let privateOfferingDistribution;

    function createToken(distributionAddress, privateOfferingDistributionAddress) {
        return ERC677BridgeToken.new(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            distributionAddress,
            privateOfferingDistributionAddress,
        );
    }

    async function createPrivateOfferingDistribution() {
        const contract = await PrivateOfferingDistribution.new().should.be.fulfilled;
        await contract.finalizeParticipants();
        return contract;
    }

    function createDistribution(privateOfferingDistributionAddress) {
        return DistributionMock.new(
            STAKING_EPOCH_DURATION,
            address[ECOSYSTEM_FUND],
            address[PUBLIC_OFFERING],
            privateOfferingDistributionAddress,
            address[FOUNDATION_REWARD],
            address[EXCHANGE_RELATED_ACTIVITIES],
        );
    }

    describe('constructor', () => {
        it('should be created', async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address).should.be.fulfilled;
            (await token.balanceOf(distribution.address)).should.be.bignumber.equal(SUPPLY);
            (await token.name()).should.be.equal('DPOS staking token');
            (await token.symbol()).should.be.equal('DPOS');
            (await token.decimals()).toNumber().should.be.equal(18);

        });
        it('should fail if invalid address', async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);

            await createToken(EMPTY_ADDRESS, privateOfferingDistribution.address).should.be.rejectedWith('not a contract');
            await createToken(accounts[1], privateOfferingDistribution.address).should.be.rejectedWith('not a contract');

            await createToken(distribution.address, EMPTY_ADDRESS).should.be.rejectedWith('not a contract');
            await createToken(distribution.address, accounts[1]).should.be.rejectedWith('not a contract');

            const emptyContract = await EmptyContract.new();
            await createToken(emptyContract.address, privateOfferingDistribution.address).should.be.rejectedWith('revert');

            await createToken(distribution.address, privateOfferingDistribution.address).should.be.fulfilled;
        });
    });
    describe('setBridgeContract', () => {
        beforeEach(async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address);
            bridge = await EmptyContract.new();
        });
        it('should set', async () => {
            await token.setBridgeContract(bridge.address).should.be.fulfilled;
            (await token.bridgeContract()).should.be.equal(bridge.address);
        });
        it('should fail if invalid or wrong address', async () => {
            await token.setBridgeContract(EMPTY_ADDRESS).should.be.rejectedWith('wrong address');
            await token.setBridgeContract(accounts[2]).should.be.rejectedWith('wrong address');
        });
        it('should fail if not an owner', async () => {
            await token.setBridgeContract(
                bridge.address,
                { from: accounts[1] }
            ).should.be.rejectedWith('Ownable: caller is not the owner');
        });
    });
    describe('transferAndCall', () => {
        const value = new BN(toWei('1'));

        beforeEach(async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address);
            recipient = await RecipientMock.new();
            await distribution.setToken(token.address);
            await distribution.transferTokens(accounts[1], value);
        });
        it('should transfer and call', async () => {
            const customString = 'Hello';
            const data = web3.eth.abi.encodeParameters(['string'], [customString]);
            await token.transferAndCall(recipient.address, value, data, { from: accounts[1] }).should.be.fulfilled;
            (await token.balanceOf(recipient.address)).should.be.bignumber.equal(value);
            (await recipient.from()).should.be.equal(accounts[1]);
            (await recipient.value()).should.be.bignumber.equal(value);
            (await recipient.customString()).should.be.equal(customString);
        });
        it('should fail if wrong custom data', async () => {
            const data = web3.eth.abi.encodeParameters(['uint256'], ['123']);
            await token.transferAndCall(
                recipient.address,
                value,
                data,
                { from: accounts[1] }
            ).should.be.rejectedWith('contract call failed');
        });
        it('should fail if recipient is bridge, Distribution or PrivateOfferingDistribution contract', async () => {
            const customString = 'Hello';
            const data = web3.eth.abi.encodeParameters(['string'], [customString]);
            bridge = await EmptyContract.new();
            await token.setBridgeContract(bridge.address).should.be.fulfilled;
            await token.transferAndCall(
                bridge.address,
                value,
                data,
                { from: accounts[1] }
            ).should.be.rejectedWith("contract call failed");
            await token.transferAndCall(
                distribution.address,
                value,
                data,
                { from: accounts[1] }
            ).should.be.rejectedWith("contract call failed");
            await token.transferAndCall(
                privateOfferingDistribution.address,
                value,
                data,
                { from: accounts[1] }
            ).should.be.rejectedWith("contract call failed");
        });
    });
    describe('transfer', () => {
        const value = new BN(toWei('1'));

        beforeEach(async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address);
            recipient = await RecipientMock.new();
            await distribution.setToken(token.address);
            await distribution.transferTokens(accounts[1], value);
        });
        it('should transfer', async () => {
            await token.transfer(accounts[2], value, { from: accounts[1] }).should.be.fulfilled;
            (await token.balanceOf(accounts[2])).should.be.bignumber.equal(value);
        });
        it('should fail if recipient is bridge, Distribution or PrivateOfferingDistribution contract', async () => {
            bridge = await EmptyContract.new();
            await token.setBridgeContract(bridge.address).should.be.fulfilled;
            await token.transfer(
                bridge.address,
                value,
                { from: accounts[1] }
            ).should.be.rejectedWith("you can't transfer to bridge contract");
            await token.transfer(
                distribution.address,
                value,
                { from: accounts[1] }
            ).should.be.rejectedWith("you can't transfer to Distribution contract");
            await token.transfer(
                privateOfferingDistribution.address,
                value,
                { from: accounts[1] }
            ).should.be.rejectedWith("you can't transfer to PrivateOfferingDistribution contract");
        });
    });
    describe('transferFrom', () => {
        const value = new BN(toWei('1'));

        beforeEach(async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address);
            recipient = await RecipientMock.new();
            await distribution.setToken(token.address);
            await distribution.transferTokens(accounts[1], value);
        });
        it('should transfer', async () => {
            await token.approve(owner, value, { from: accounts[1] }).should.be.fulfilled;
            await token.transferFrom(accounts[1], accounts[2], value).should.be.fulfilled;
            (await token.balanceOf(accounts[2])).should.be.bignumber.equal(value);
        });
        it('should fail if recipient is bridge, Distribution or PrivateOfferingDistribution contract', async () => {
            bridge = await EmptyContract.new();
            await token.setBridgeContract(bridge.address).should.be.fulfilled;
            await token.approve(owner, value, { from: accounts[1] }).should.be.fulfilled;
            await token.transferFrom(
                accounts[1],
                bridge.address,
                value,
            ).should.be.rejectedWith("you can't transfer to bridge contract");
            await token.transferFrom(
                accounts[1],
                distribution.address,
                value,
            ).should.be.rejectedWith("you can't transfer to Distribution contract");
            await token.transferFrom(
                accounts[1],
                privateOfferingDistribution.address,
                value,
            ).should.be.rejectedWith("you can't transfer to PrivateOfferingDistribution contract");
        });
    });
    describe('claimTokens', () => {
        const value = new BN(toWei('1'));
        let anotherToken;

        beforeEach(async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address);
            recipient = await RecipientMock.new();
            anotherToken = await TokenMock.new();

            await anotherToken.mint(accounts[2], value).should.be.fulfilled;
            await anotherToken.transfer(token.address, value, { from: accounts[2] }).should.be.fulfilled;
            (await anotherToken.balanceOf.call(token.address)).should.be.bignumber.equal(value);
        });
        it('should claim tokens', async () => {
            await token.claimTokens(anotherToken.address, accounts[3]).should.be.fulfilled;
            (await anotherToken.balanceOf.call(accounts[3])).should.be.bignumber.equal(value);
        });
        it('should fail if invalid recipient', async () => {
            await token.claimTokens(
                anotherToken.address,
                EMPTY_ADDRESS
            ).should.be.rejectedWith('not a valid recipient');
            await token.claimTokens(
                anotherToken.address,
                token.address
            ).should.be.rejectedWith('not a valid recipient');
        });
        it('should fail if not an owner', async () => {
            await token.claimTokens(
                anotherToken.address,
                accounts[3],
                { from: accounts[1] }
            ).should.be.rejectedWith('Ownable: caller is not the owner.');
        });
        async function claimTokens(to) {
            token = await BridgeTokenMock.new(
                TOKEN_NAME,
                TOKEN_SYMBOL,
                distribution.address,
                privateOfferingDistribution.address,
            );
            const balanceBefore = new BN(await web3.eth.getBalance(to));

            await web3.eth.sendTransaction({ from: owner, to: token.address, value });
            await token.claimTokens(EMPTY_ADDRESS, to).should.be.fulfilled;

            const balanceAfter = new BN(await web3.eth.getBalance(to));
            balanceAfter.should.be.bignumber.equal(balanceBefore.add(value));
        }
        it('should claim eth', async () => {
            await claimTokens(accounts[3]);
        });
        it('should claim eth to non-payable contract', async () => {
            const nonPayableContract = await EmptyContract.new();
            await claimTokens(nonPayableContract.address);
        });
    });
    describe('renounceOwnership', () => {
        it('should fail (not implemented)', async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distribution = await createDistribution(privateOfferingDistribution.address);
            token = await createToken(distribution.address, privateOfferingDistribution.address);
            await token.renounceOwnership().should.be.rejectedWith('not implemented');
        });
    });
});
