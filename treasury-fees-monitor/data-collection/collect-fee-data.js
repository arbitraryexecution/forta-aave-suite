const commandLineArgs = require('command-line-args');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const ethers = require('ethers');
const fs = require('fs');

require('dotenv').config();

const BLOCK_CHUNK = 128;
const SECONDS_IN_DAY = 24 * 60 * 60;

// eslint-disable-next-line consistent-return
async function getBlockByTimestamp(provider, timestamp, startBlock) {
  const withinSeconds = 60; // within approx. 1 minute
  let highBlock = startBlock;
  let lowBlock = 0;

  while (lowBlock < highBlock) {
    const midBlockNum = lowBlock + Math.floor((highBlock - lowBlock) / 2);
    // eslint-disable-next-line no-await-in-loop
    const midBlock = await provider.getBlock(midBlockNum);

    if (Math.abs(midBlock.timestamp - timestamp) <= withinSeconds) {
      return midBlock;
    }

    if (midBlock.timestamp > timestamp) {
      highBlock = midBlock.number;
    } else if (midBlock.timestamp < timestamp) {
      lowBlock = midBlock.number;
    }
  }
}

async function collectData(provider, filterInfo, timePeriod) {
  const endBlockNum = await provider.getBlockNumber();
  const endBlock = await provider.getBlock(endBlockNum);

  const startTimestamp = (endBlock.timestamp - (timePeriod * SECONDS_IN_DAY));
  const startBlock = await getBlockByTimestamp(provider, startTimestamp, endBlockNum);
  const startBlockNum = startBlock.number;

  // chunk each getLogs call into a smaller block range so there is less of a chance that a
  // 'too many logs' type error occurs
  const promises = [];
  for (let i = startBlockNum; i <= endBlockNum; i += BLOCK_CHUNK) {
    const filterBlockStart = i;
    const filterBlockEnd = (i + BLOCK_CHUNK > endBlockNum) ? endBlockNum : i + BLOCK_CHUNK;

    // create the filter Object to look for this topic hash emitted from the specified address
    const filter = {
      fromBlock: filterBlockStart,
      toBlock: filterBlockEnd,
      topics: [filterInfo.topicHash],
      address: filterInfo.address,
    };

    promises.push(provider.getLogs(filter));
  }

  return (await Promise.all(promises)).flat();
}

async function writeToCSV(format, dataSet, fileName) {
  // iterate through each object in data and parse according to the format given
  const formattedData = dataSet.map((data) => {
    const dataToWrite = {};
    data.log.args.forEach((arg, index) => {
      // eslint-disable-next-line no-underscore-dangle
      if (arg._isBigNumber) {
        dataToWrite[format[index].id] = arg.toString();
      } else {
        dataToWrite[format[index].id] = arg;
      }
    });

    dataToWrite.blockNumber = data.blockNumber;
    dataToWrite.txHash = data.txHash;

    return dataToWrite;
  });

  // write as a csv using the format provided
  const csvWriter = createCsvWriter({
    path: `${__dirname}/${fileName}.csv`,
    header: format,
  });

  await csvWriter.writeRecords(formattedData);
}

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_URL);

  // command line options
  // abi filename, event to search for, time period (days) (optional), output file name (optional)
  const cliOptions = [
    { name: 'abi', type: String },
    { name: 'address', type: String },
    { name: 'event', alias: 'e', type: String },
    {
      name: 'timePeriod', alias: 't', type: Number, defaultValue: '180',
    },
    {
      name: 'output', alias: 'o', type: String, defaultValue: 'results',
    },
  ];

  const cliArgs = commandLineArgs(cliOptions);
  const {
    abi, address, event, timePeriod, output,
  } = cliArgs;

  // load the passed-in ABI file and use that to create an ethers.js interface
  if (!fs.existsSync(abi)) {
    throw new Error(`ABI file ${abi} does not exist.`);
  }

  const abiFile = JSON.parse(fs.readFileSync(abi));
  const iface = new ethers.utils.Interface(abiFile.abi);

  // use the interface to get the topic hash of the event requested
  const topicHash = ethers.utils.id(iface.getEvent(event).format(ethers.utils.FormatTypes.sighash));

  // parse the blockchain with the given time period for relevant data
  const filterInfo = {
    topicHash,
    address,
  };

  const parsedEvents = await collectData(provider, filterInfo, timePeriod);
  const eventData = parsedEvents.map((eventInstance) => {
    const {
      blockNumber, data, topics, transactionHash: txHash,
    } = eventInstance;

    const parsedLog = iface.parseLog({ data, topics });
    return {
      blockNumber,
      txHash,
      log: parsedLog,
    };
  });

  // write any data found to a CSV file
  const csvFormat = iface.getEvent(event).inputs.map((input) => (
    { id: input.name, title: input.name }
  ));

  // add additional blockNumber and txHash fields for CSV format
  csvFormat.push({ id: 'blockNumber', title: 'blockNumber' });
  csvFormat.push({ id: 'txHash', title: 'txHash' });

  writeToCSV(csvFormat, eventData, output);
})();
