const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const defaults = () => ({ items: [], nextId: 1 });
const tableName = process.env.TABLE_NAME;
const localDb = tableName ? null : low(new FileSync('wishlist.json'));
const dynamo = tableName
  ? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })
  : null;

if (localDb) localDb.defaults(defaults()).write();

async function getState() {
  if (localDb) return { ...defaults(), ...localDb.getState() };

  const result = await dynamo.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'wishlist' },
    ConsistentRead: true
  }));
  return result.Item?.state || defaults();
}

async function updateState(update) {
  if (localDb) {
    const state = { ...defaults(), ...localDb.getState() };
    const result = update(state) || state;
    localDb.setState(result).write();
    return result;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'wishlist' },
      ConsistentRead: true
    }));
    const version = current.Item?.version;
    const state = structuredClone(current.Item?.state || defaults());
    const updated = update(state) || state;
    if (Buffer.byteLength(JSON.stringify(updated), 'utf8') > 350000) {
      throw new Error('Wishlist state is too large for the current DynamoDB storage design');
    }
    const input = {
      TableName: tableName,
      Item: { pk: 'wishlist', version: (version || 0) + 1, state: updated },
      ConditionExpression: version === undefined ? 'attribute_not_exists(pk)' : '#version = :version',
      ExpressionAttributeNames: version === undefined ? undefined : { '#version': 'version' },
      ExpressionAttributeValues: version === undefined ? undefined : { ':version': version }
    };

    try {
      await dynamo.send(new PutCommand(input));
      return updated;
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException' || attempt === 7) throw error;
    }
  }

  throw new Error('Could not update wishlist after concurrent-write retries');
}

function sortedItems(items) {
  return [...items].sort((left, right) =>
    (left.purchased || 0) - (right.purchased || 0) ||
    (left.order ?? 0) - (right.order ?? 0) ||
    String(right.created_at || '').localeCompare(String(left.created_at || ''))
  );
}

module.exports = { getState, updateState, sortedItems };