/**
 * Factory for stub methods that fail loud when an out-of-scope code path
 * is hit in production.
 *
 * Per the migration plan, controller paths with no production traffic in
 * the last 2 months AND no Postman coverage are NOT migrated to DynamoDB.
 * Their DynamoDB models raise `NotImplementedError` instead of silently
 * returning wrong results — a CloudWatch alarm on this message tells us
 * immediately if our scoping assumption was wrong.
 */
export class NotImplementedError extends Error {
  constructor(methodName, reason) {
    super(
      `NotImplemented: ${methodName} was not migrated because it has no ` +
      'production traffic in the last 2 months and is not covered by the ' +
      `Postman smoke test. ${reason || ''
      } If you need this, implement it now or revert to Mongoose.`
    );
    this.name = 'NotImplementedError';
    this.methodName = methodName;
  }
}

export function notImplemented(methodName, reason) {
  return function notImplementedStub() {
    throw new NotImplementedError(methodName, reason);
  };
}
