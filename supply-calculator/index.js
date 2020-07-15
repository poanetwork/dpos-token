const http = require('http');
const Web3 = require('web3');

const web3 = new Web3(process.env.RPC_URL || 'https://mainnet.infura.io/v3/1125fe73d87c4e5396678f4e3089b3dd');
const BN = web3.utils.BN;

// Token contract instance
const tokenContract = new web3.eth.Contract(
  [{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}],
  '0x0Ae055097C6d159879521C384F1D2123D1f195e6'
);

// Parse BURN_ADDRESSES
const zeroAddress = '0x0000000000000000000000000000000000000000';
let burnAddresses = process.env.BURN_ADDRESSES || zeroAddress;
burnAddresses = burnAddresses.split(',');
if (!burnAddresses.includes(zeroAddress)) {
  burnAddresses.push(zeroAddress);
}

// Output circulating supply on demand
let circulatingSupply = '0';
let totalSupply = '0';
const server = http.createServer(async (req, res) => {
  if (req.url === '/total') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(totalSupply);
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(circulatingSupply);
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(process.env.PORT || 3000);
readSupply();

// Reads and calculates supply
async function readSupply() {
  totalSupply = new BN(await tokenContract.methods.totalSupply().call());
  const distributionBalance = new BN(await tokenContract.methods.balanceOf('0x9BC4a93883C522D3C79c81c2999Aab52E2268d03').call());
  const privateOfferingBalance = new BN(await tokenContract.methods.balanceOf('0x3cFE51b61E25750ab1426b0072e5D0cc5C30aAfA').call());
  const advisorsRewardBalance = new BN(await tokenContract.methods.balanceOf('0x0218B706898d234b85d2494DF21eB0677EaEa918').call());
  
  let zeroBalance = new BN(0);
  for (let i = 0; i < burnAddresses.length; i++) {
    zeroBalance = zeroBalance.add(new BN(await tokenContract.methods.balanceOf(burnAddresses[i]).call()));
  }

  circulatingSupply = web3.utils.fromWei(
    totalSupply
      .sub(distributionBalance)
      .sub(privateOfferingBalance)
      .sub(advisorsRewardBalance)
      .sub(zeroBalance)
  );
  totalSupply = web3.utils.fromWei(totalSupply);

  log(`${circulatingSupply}, ${totalSupply}`);

  setTimeout(readSupply, (process.env.REFRESH_INTERVAL || 10)*1000); // update every N seconds
}

// Prints log message with the current time
function log(message) {
  const now = new Date;
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() - 0 + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const hours = (now.getUTCHours() - 0).toString().padStart(2, '0');
  const minutes = (now.getUTCMinutes() - 0).toString().padStart(2, '0');
  const seconds = (now.getUTCSeconds() - 0).toString().padStart(2, '0');
  const time = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
  console.log(`${time} ${message}`);
}
