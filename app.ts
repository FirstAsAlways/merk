import express, { Request, Response, NextFunction } from 'express';
import flash from 'connect-flash';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import methodOverride from 'method-override';
import fs from 'fs';
import { parse } from 'csv-parse';
import { ethers } from 'ethers';
import fileUpload from 'express-fileupload';
import { parseBalanceMap } from './parse-balance-map';

const PRIVATE_CSV_PATH = './req/PRIVATE.csv';
const PUBLIC_CSV_PATH = './req/PUBLIC.csv';
const PRIVATELIST_JSON_PATH = './req/Privatelist.json';
const WHITELIST_JSON_PATH = './req/Whitelist.json';
const NAME_MAP_PATH = './data/Name.json';
const PRIVATELIST_MAP_PATH = './data/PrivatelistMap.json';
const WHITELIST_MAP_PATH = './data/WhitelistMap.json';
const ADMIN1_WALLET_ADDRESS = '0xB0c445C292C2E33388118Bef6FE2AD9D313f90ec';
const ADMIN2_WALLET_ADDRESS = '0x79A16789FC811DbD21C5fD6c96BA93c7c709f7d0';
const DEVELOPER_WALLET_ADDRESS = '0xBf8fF255aD1f369929715a3290d1ef71d79f8954';



const app = express();

app.use(cookieParser());
app.use(cors());
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(flash());
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
}));

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}.`);
});

const generateMerkleRoot = async () => {
  const jsonPrivate = JSON.parse(fs.readFileSync(PRIVATELIST_JSON_PATH, { encoding: 'utf8' }));
  const jsonWhitelist = JSON.parse(fs.readFileSync(WHITELIST_JSON_PATH, { encoding: 'utf8' }));
  fs.writeFileSync(PRIVATELIST_MAP_PATH, JSON.stringify(parseBalanceMap(jsonPrivate)));
  fs.writeFileSync(WHITELIST_MAP_PATH, JSON.stringify(parseBalanceMap(jsonWhitelist)));
}

const generateMap = async () => {
  try {
    var MM_PrivatelistMap = {};
    var MM_WhitelistMap = {};
    var MM_NameMap = {};

    fs.createReadStream(PRIVATE_CSV_PATH)
      .pipe(parse({ delimiter: ",", from_line: 2 }))
      .on("data", async function (row) {
        try {
          const name = row[0].trim();
          const address = ethers.utils.getAddress(row[1].trim());
          const publicOrPrivate = row[2].trim();
          const allowedMintLimit = parseInt(row[3].trim());

          if (publicOrPrivate == "Private") {
            MM_NameMap[address] = {
              name: name,
              status: "Private",
              mintLimit: allowedMintLimit
            };
            MM_PrivatelistMap[address] = allowedMintLimit;
          } else {
            MM_NameMap[address] = {
              name: name,
              status: "Public",
              mintLimit: allowedMintLimit
            };
            MM_WhitelistMap[address] = allowedMintLimit;
          }
        } catch (error) {

        }
      })
      .on("end", function () {
        console.log("finished privatelist");

        fs.createReadStream(PUBLIC_CSV_PATH)
          .pipe(parse({ delimiter: ",", from_line: 2 }))
          .on("data", async function (row) {
            try {
              const name = row[0].trim();
              const address = ethers.utils.getAddress(row[1].trim());
              const publicOrPrivate = row[2].trim();
              const allowedMintLimit = parseInt(row[3].trim());


              if (publicOrPrivate == "Private") {
                MM_NameMap[address] = {
                  name: name,
                  status: "Private",
                  mintLimit: allowedMintLimit
                };
                MM_PrivatelistMap[address] = allowedMintLimit;
              } else {
                MM_NameMap[address] = {
                  name: name,
                  status: "Public",
                  mintLimit: allowedMintLimit
                };
                MM_WhitelistMap[address] = allowedMintLimit;
              }
            } catch (error) {

            }
          })
          .on("end", function () {
            console.log("finished Whitelist");
            fs.writeFileSync(PRIVATELIST_JSON_PATH, JSON.stringify(MM_PrivatelistMap));
            fs.writeFileSync(WHITELIST_JSON_PATH, JSON.stringify(MM_WhitelistMap));
            fs.writeFileSync(NAME_MAP_PATH, JSON.stringify(MM_NameMap));

            generateMerkleRoot();
          })
          .on("error", function (error) {
            console.log(error.message);
          });
      })
      .on("error", function (error) {
        console.log(error.message);
      });

  } catch (error) {
    console.log(error);
  }
}

interface NameData {
  name: string;
  status: string;
  mintLimit: number;
};

interface ProofData {
  index: number;
  amount: string;
  proof: [];
};

interface RootData {
  privateRoot: string;
  publicRoot: string;
};

const getRoots = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const privateListMap = JSON.parse(fs.readFileSync(PRIVATELIST_MAP_PATH, { encoding: 'utf8' }));
    const whiteListMap = JSON.parse(fs.readFileSync(WHITELIST_MAP_PATH, { encoding: 'utf8' }));
    const privateRoot = privateListMap.merkleRoot;
    const publicRoot = whiteListMap.merkleRoot;
    if (privateRoot && publicRoot) {
      const rootData: RootData = {
        privateRoot: privateRoot,
        publicRoot: publicRoot,
      }
      response.status(200).json(rootData);
    } else {
      response.status(203).send("Not Found");
    }
  } catch (error) {
    console.log(error);
    response.status(400).send("Failed");
  }
};

const getName = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const walletAddress = request.params.walletAddress;

    const nameMap = JSON.parse(fs.readFileSync(NAME_MAP_PATH, { encoding: 'utf8' }));

    const nameData: NameData = nameMap[walletAddress];
    if (nameData) {
      response.status(200).json(nameData);
    } else {
      response.status(203).send("Not Found");
    }
  } catch (error) {
    console.log(error);
    response.status(400).send("Failed");
  }
};

const getPrivateProof = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const walletAddress = request.params.walletAddress;

    const privateListMap = JSON.parse(fs.readFileSync(PRIVATELIST_MAP_PATH, { encoding: 'utf8' }));

    const proofData: ProofData = privateListMap.claims[walletAddress];
    if (proofData) {
      return response.status(200).json(proofData);
    } else {
      return response.status(203).send("Not Found");
    }
  } catch (error) {
    console.log(error);
    return response.status(400).send("Failed");
  }
};

const getPublicProof = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const walletAddress = request.params.walletAddress;

    const whiteListMap = JSON.parse(fs.readFileSync(WHITELIST_MAP_PATH, { encoding: 'utf8' }));

    const proofData: ProofData = whiteListMap.claims[walletAddress];
    if (proofData) {
      return response.status(200).json(proofData);
    } else {
      return response.status(203).send("Not Found");
    }
  } catch (error) {
    console.log(error);
    return response.status(400).send("Failed");
  }
};

const uploadPrivateCSV = async (req, res) => {
  try {
    console.log("uploadPrivateCSV");
    const signData = req.body.signData;
    const walletAddress = req.body.walletAddress;
    const timestamp = req.body.timestamp;
    if (!signData || !walletAddress || !timestamp) return res.status(500).send('Invalid Parameters');
    const recoverWallet = ethers.utils.verifyMessage(ethers.utils.arrayify(ethers.utils.hashMessage(`${walletAddress}-${timestamp}`)), signData);
    if (recoverWallet != ethers.utils.getAddress(ADMIN1_WALLET_ADDRESS) &&
      recoverWallet != ethers.utils.getAddress(ADMIN2_WALLET_ADDRESS) &&
      recoverWallet != ethers.utils.getAddress(DEVELOPER_WALLET_ADDRESS)) return res.status(500).send('Invalid Administrator');

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(203).send('No files were uploaded.');
    }
    const csvFile = req.files.csvFile;
    csvFile.mv(PRIVATE_CSV_PATH, function (err) {
      if (err) return res.status(500).send(err);
      generateMap();
      console.log("--- Private CSV Upload Success! ---");
      return res.status(200).send("Updated Private CSV");
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send("Failed");
  }
};

const uploadPublicCSV = async (req, res) => {
  try {
    const signData = req.body.signData;
    const walletAddress = req.body.walletAddress;
    const timestamp = req.body.timestamp;
    if (!signData || !walletAddress || !timestamp) return res.status(500).send('Invalid Parameters');
    const recoverWallet = ethers.utils.verifyMessage(ethers.utils.arrayify(ethers.utils.hashMessage(`${walletAddress}-${timestamp}`)), signData);
    if (recoverWallet != ethers.utils.getAddress(ADMIN1_WALLET_ADDRESS) &&
      recoverWallet != ethers.utils.getAddress(ADMIN2_WALLET_ADDRESS) &&
      recoverWallet != ethers.utils.getAddress(DEVELOPER_WALLET_ADDRESS)) return res.status(500).send('Invalid Administrator');

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(203).send('No files were uploaded.');
    }
    const csvFile = req.files.csvFile;
    csvFile.mv(PUBLIC_CSV_PATH, function (err) {
      if (err) return res.status(500).send(err);
      generateMap();
      console.log("--- Public CSV Upload Success! ---");
      return res.status(200).send("Updated Public CSV");
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send("Failed");
  }
};

const regenerateMerkleRoot = async (req, res) => {
  try {
    const signData = req.body.signData;
    const walletAddress = req.body.walletAddress;
    const timestamp = req.body.timestamp;
    if (!signData || !walletAddress || !timestamp) return res.status(500).send('Invalid Parameters');
    const recoverWallet = ethers.utils.verifyMessage(ethers.utils.arrayify(ethers.utils.hashMessage(`${walletAddress}-${timestamp}`)), signData);
    if (recoverWallet != ethers.utils.getAddress(ADMIN1_WALLET_ADDRESS) &&
      recoverWallet != ethers.utils.getAddress(ADMIN2_WALLET_ADDRESS) &&
      recoverWallet != ethers.utils.getAddress(DEVELOPER_WALLET_ADDRESS)) return res.status(500).send('Invalid Administrator');
    
    generateMap();
    console.log("--- MerkleTree Generate Success! ---");


  } catch (error) {
    console.log(error);
    return res.status(400).send("Failed");
  }
};


app.get('/getRoots', getRoots);
app.get('/getName/:walletAddress', getName);
app.get('/getPrivateProof/:walletAddress', getPrivateProof);
app.get('/getPublicProof/:walletAddress', getPublicProof);
app.post('/uploadPrivateCSV', uploadPrivateCSV);
app.post('/uploadPublicCSV', uploadPublicCSV);
app.put('/regenerateMerkleRoot', regenerateMerkleRoot);