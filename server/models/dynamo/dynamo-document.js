import { PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import { getDocClient } from './dynamo-client.js';
import QueryProxy from './query-proxy.js';

/**
 * Base class that mimics the surface area of a Mongoose document the
 * existing controllers rely on.
 *
 * Controllers use patterns like:
 *   const m = new Marker({...}); await m.save();
 *   await instance.deleteOne();
 *   instance.markModified('data');
 *   instance.toObject();
 *
 * Subclasses (MarkerDynamo, RevisionDynamo, ...) set their own static
 * `tableName` and override hooks as needed. The constructor simply copies
 * props onto the instance so callers see the same shape Mongoose gave them.
 */
export default class DynamoDocument {
  static tableName = null;

  constructor(props = {}) {
    Object.assign(this, props);
  }

  markModified() {
    // No-op: Mongoose change-tracking isn't needed for DynamoDB PutItem.
  }

  toObject() {
    const out = {};
    for (const key of Object.keys(this)) {
      const value = this[key];
      if (typeof value === 'function') continue;
      out[key] = value;
    }
    return out;
  }

  toJSON() {
    return this.toObject();
  }

  async save() {
    const ctor = this.constructor;
    if (!ctor.tableName) {
      throw new Error(`${ctor.name} is missing static tableName`);
    }
    const item = this.toObject();
    await getDocClient().send(new PutCommand({
      TableName: ctor.tableName,
      Item: item
    }));
    return this;
  }

  async deleteOne() {
    const ctor = this.constructor;
    if (!ctor.tableName) {
      throw new Error(`${ctor.name} is missing static tableName`);
    }
    if (this._id === undefined || this._id === null) {
      throw new Error(`${ctor.name}.deleteOne(): missing _id on instance`);
    }
    await getDocClient().send(new DeleteCommand({
      TableName: ctor.tableName,
      Key: { _id: this._id }
    }));
    return this;
  }

  static findById(id) {
    const Model = this;
    const promise = (async () => {
      if (!Model.tableName) {
        throw new Error(`${Model.name} is missing static tableName`);
      }
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: Model.tableName,
        Key: { _id: id }
      }));
      return Item ? new Model(Item) : null;
    })();
    return new QueryProxy(promise);
  }

  static async get(id) {
    const doc = await this.findById(id).exec();
    if (doc) return doc;
    const err = new APIError(`No such ${this.name} exists!`, httpStatus.NOT_FOUND);
    throw err;
  }
}
