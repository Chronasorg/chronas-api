# Current Production Setup Summary

Generated: 2025-10-06T14:11:49.276Z

## DocumentDB Clusters

### databaseb269d8bb-phnragzw0yth
- **Engine Version**: 3.6.0
- **Status**: available
- **Endpoint**: databaseb269d8bb-phnragzw0yth.cluster-cstwu7mt2svi.eu-west-1.docdb.amazonaws.com
- **Port**: 27017
- **VPC**: cluster-WWY3U47MSKYAT4OZQYXOI6VP6M
- **Instances**: 1

## Lambda Functions

### ChronasApiLambdaStack-ChronasApiLambdaFunction7C76-HsfSlA0k7fuU
- **Runtime**: undefined
- **Memory**: 400MB
- **Timeout**: 300s
- **Last Modified**: 2025-07-11T04:45:32.000+0000
- **Code Size**: 0 bytes
- **Handler**: undefined

### ChronasFrontendS3Stack-CustomS3AutoDeleteObjectsCu-Ui7ewcHUZewT
- **Runtime**: nodejs18.x
- **Memory**: 128MB
- **Timeout**: 900s
- **Last Modified**: 2025-09-11T13:26:37.482+0000
- **Code Size**: 1956 bytes
- **Handler**: index.handler

## API Gateway

## CloudFormation Stacks

### ChronasFrontendS3Stack
- **Status**: UPDATE_COMPLETE
- **Created**: 2025-09-11T13:26:09.702000+00:00
- **Description**: N/A

### ChronasApiLambdaStack
- **Status**: UPDATE_COMPLETE
- **Created**: 2023-09-22T15:01:26.634000+00:00
- **Description**: N/A

### BuildChronasAPi
- **Status**: UPDATE_COMPLETE
- **Created**: 2023-09-22T14:29:31.037000+00:00
- **Description**: N/A

## Next Steps

1. **Review this documentation** to understand current setup
2. **Create DocumentDB snapshot** before any changes
3. **Plan Lambda deployment** strategy
4. **Test in development** environment first
5. **Execute production deployment** with proper backups

See SIMPLE_PRODUCTION_DEPLOYMENT.md for deployment steps.
