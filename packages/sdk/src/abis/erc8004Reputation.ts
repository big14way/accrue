// Hand-written minimal ABI.
export const erc8004ReputationAbi = [
  {
    "type": "function",
    "name": "getSummary",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256"
      },
      {
        "name": "clientAddresses",
        "type": "address[]"
      },
      {
        "name": "tag1",
        "type": "string"
      },
      {
        "name": "tag2",
        "type": "string"
      }
    ],
    "outputs": [
      {
        "name": "count",
        "type": "uint64"
      },
      {
        "name": "summaryValue",
        "type": "int128"
      },
      {
        "name": "summaryValueDecimals",
        "type": "uint8"
      }
    ]
  },
  {
    "type": "function",
    "name": "readAllFeedback",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256"
      },
      {
        "name": "clientAddresses",
        "type": "address[]"
      },
      {
        "name": "tag1",
        "type": "string"
      },
      {
        "name": "tag2",
        "type": "string"
      },
      {
        "name": "includeRevoked",
        "type": "bool"
      }
    ],
    "outputs": [
      {
        "name": "clients",
        "type": "address[]"
      },
      {
        "name": "feedbackIndexes",
        "type": "uint64[]"
      },
      {
        "name": "values",
        "type": "int128[]"
      },
      {
        "name": "valueDecimals",
        "type": "uint8[]"
      },
      {
        "name": "tag1s",
        "type": "string[]"
      },
      {
        "name": "tag2s",
        "type": "string[]"
      },
      {
        "name": "revokedStatuses",
        "type": "bool[]"
      }
    ]
  },
  {
    "type": "event",
    "name": "NewFeedback",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "clientAddress",
        "type": "address",
        "indexed": true
      },
      {
        "name": "feedbackIndex",
        "type": "uint64",
        "indexed": false
      },
      {
        "name": "value",
        "type": "int128",
        "indexed": false
      },
      {
        "name": "valueDecimals",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "indexedTag1",
        "type": "string",
        "indexed": true
      },
      {
        "name": "tag1",
        "type": "string",
        "indexed": false
      },
      {
        "name": "tag2",
        "type": "string",
        "indexed": false
      },
      {
        "name": "endpoint",
        "type": "string",
        "indexed": false
      },
      {
        "name": "feedbackURI",
        "type": "string",
        "indexed": false
      },
      {
        "name": "feedbackHash",
        "type": "bytes32",
        "indexed": false
      }
    ]
  }
] as const;
