// Minimal Lambda handler for testing deployment
export const handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify({
      message: 'Chronas API - Minimal Test Handler',
      timestamp: new Date().toISOString(),
      event: event.httpMethod || 'unknown',
      path: event.path || event.rawPath || 'unknown'
    })
  };
};