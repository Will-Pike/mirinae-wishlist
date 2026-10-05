const fs = require('fs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

async function main() {
  const [, , filePath, ...flags] = process.argv;
  const tableName = process.env.TABLE_NAME;
  if (!filePath || !tableName) {
    throw new Error('Usage: TABLE_NAME=... node scripts/import-wishlist.js <items.json> [--replace]');
  }

  const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(items) || items.some(item => !Number.isInteger(item.id) || typeof item.title !== 'string')) {
    throw new Error('Input must be an array of wishlist items with integer ids and string titles');
  }
  if (new Set(items.map(item => item.id)).size !== items.length) {
    throw new Error('Input contains duplicate item ids');
  }

  const state = {
    items,
    nextId: items.reduce((nextId, item) => Math.max(nextId, item.id + 1), 1)
  };
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > 350000) {
    throw new Error('Wishlist is too large for the current single-record DynamoDB storage design');
  }

  const replace = flags.includes('--replace');
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true }
  });
  const input = {
    TableName: tableName,
    Item: { pk: 'wishlist', version: 1, state },
    ...(replace ? {} : { ConditionExpression: 'attribute_not_exists(pk)' })
  };

  await client.send(new PutCommand(input));
  console.log(`Imported ${items.length} items; next id is ${state.nextId}.`);
}

main().catch(error => {
  if (error.name === 'ConditionalCheckFailedException') {
    console.error('A wishlist record already exists; inspect the table or rerun with --replace.');
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});