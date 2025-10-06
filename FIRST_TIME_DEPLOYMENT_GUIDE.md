# 🚀 First-Time Lambda Deployment Guide

## 📋 **Overview**

The automated deployment system now handles **both scenarios**:
1. **First-time deployment** (when Lambda function doesn't exist yet)
2. **Subsequent deployments** (fast function code updates)

## 🔄 **Two-Stage Deployment Strategy**

### **Stage 1: Initial Deployment** (First Time Only)
When the Lambda function doesn't exist yet, the system automatically:

1. **Detects missing Lambda stack**
2. **Performs full CDK deployment** to create all infrastructure
3. **Creates Lambda function, API Gateway, IAM roles, etc.**
4. **Takes ~5-10 minutes** (one-time setup)

### **Stage 2: Fast Updates** (All Subsequent Deployments)
Once the Lambda function exists, the system:

1. **Detects existing Lambda stack**
2. **Updates only the function code** via AWS Lambda API
3. **Skips infrastructure changes**
4. **Takes ~2 minutes** (optimized updates)

## 🛠️ **Technical Implementation**

### **Smart Detection Logic**
```bash
if aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --region eu-west-1 >/dev/null 2>&1; then
  echo "Lambda stack exists - performing function code update..."
  # Fast update path
else
  echo "Lambda stack does not exist - performing initial CDK deployment..."
  # Full deployment path
fi
```

### **First-Time Deployment Process**
```bash
# 1. Build CDK infrastructure
cd ../chronas-cdk && npm run build

# 2. Deploy complete Lambda stack
npx cdk deploy ChronasApiLambdaStackV2 --require-approval never

# 3. Creates:
#    - Lambda function
#    - API Gateway
#    - IAM roles
#    - VPC configuration
#    - CloudWatch logs
#    - All necessary infrastructure
```

### **Subsequent Deployment Process**
```bash
# 1. Discover existing function
LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks ...)

# 2. Create optimized deployment package
zip -r lambda-deployment.zip . -x "node_modules/*" "*.git*" "tests/*"
npm ci --production
zip -r lambda-deployment.zip node_modules/

# 3. Update function code directly
aws lambda update-function-code --function-name $LAMBDA_FUNCTION_NAME --zip-file fileb://lambda-deployment.zip

# 4. Wait for function to be ready
aws lambda wait function-updated --function-name $LAMBDA_FUNCTION_NAME
```

## 📊 **Deployment Scenarios**

### **Scenario 1: Brand New Environment**
- **Trigger**: Push to `feature/modernize-api` branch
- **Detection**: No `ChronasApiLambdaStackV2` stack exists
- **Action**: Full CDK deployment
- **Duration**: ~5-10 minutes
- **Result**: Complete Lambda infrastructure created

### **Scenario 2: Existing Environment**
- **Trigger**: Push to `feature/modernize-api` branch
- **Detection**: `ChronasApiLambdaStackV2` stack exists
- **Action**: Function code update only
- **Duration**: ~2 minutes
- **Result**: Lambda function code updated

### **Scenario 3: Stack Deleted/Recreated**
- **Trigger**: Push after stack deletion
- **Detection**: No stack exists (falls back to Scenario 1)
- **Action**: Full CDK deployment
- **Duration**: ~5-10 minutes
- **Result**: Infrastructure recreated

## 🎯 **Usage Instructions**

### **For First-Time Setup**
1. **Ensure prerequisites**:
   - `ChronasApiLambdaStackV2` stack does NOT exist
   - All dependencies are in place (VPC, secrets, etc.)

2. **Trigger deployment**:
   ```bash
   # Push to feature branch
   git push origin feature/modernize-api
   
   # OR trigger manually
   aws codebuild start-build --project-name chronas-api-lambda-deploy-standalone --profile chronas-dev
   ```

3. **Monitor progress**:
   - **Expected duration**: 5-10 minutes
   - **Watch for**: "performing initial CDK deployment" message
   - **Success indicator**: Lambda function created and accessible

### **For Regular Updates**
1. **Make code changes** in `feature/modernize-api` branch
2. **Push changes**: `git push origin feature/modernize-api`
3. **Automatic deployment**: ~2 minutes
4. **Verification**: Function code updated

## 🔍 **Monitoring & Troubleshooting**

### **Check Deployment Type**
```bash
# Check if Lambda stack exists
aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --region eu-west-1 --profile chronas-dev

# If exists: Fast update will be used
# If not exists: Full deployment will be used
```

### **Monitor Build Progress**
```bash
# Get latest build
aws codebuild list-builds-for-project --project-name chronas-api-lambda-deploy-standalone --profile chronas-dev --max-items 1

# Check build status
aws codebuild batch-get-builds --ids <build-id> --profile chronas-dev

# View logs
aws logs get-log-events --log-group-name /aws/codebuild/chronas-api-lambda-deploy-standalone --log-stream-name <stream-name> --profile chronas-dev
```

### **Common Issues & Solutions**

#### **Issue**: First deployment fails
**Solution**: Check dependencies (VPC, secrets, IAM permissions)

#### **Issue**: Function update fails
**Solution**: Verify function exists and has correct permissions

#### **Issue**: Build times out
**Solution**: Check for dependency installation issues or network problems

## 📈 **Performance Expectations**

| Deployment Type | Duration | Frequency | Use Case |
|----------------|----------|-----------|----------|
| **First-time** | 5-10 min | Once per environment | Initial setup |
| **Code updates** | ~2 min | Every code change | Development workflow |
| **Infrastructure changes** | 5-10 min | Rare | Stack modifications |

## 🎉 **Benefits of This Approach**

### ✅ **Intelligent Automation**
- **Automatically detects** deployment scenario
- **Chooses optimal strategy** based on current state
- **No manual intervention** required

### ✅ **Best of Both Worlds**
- **Complete infrastructure** setup when needed
- **Lightning-fast updates** for code changes
- **Consistent deployment process** regardless of scenario

### ✅ **Developer Experience**
- **Single command** works for all scenarios
- **Predictable behavior** based on environment state
- **Clear feedback** about deployment type chosen

### ✅ **Production Ready**
- **Handles edge cases** (stack deletion, recreation)
- **Robust error handling** and recovery
- **Comprehensive logging** for troubleshooting

---

## 🚀 **Ready to Deploy!**

The automated deployment system now handles **any scenario** you throw at it:

- **New environment?** ✅ Full deployment
- **Code changes?** ✅ Fast updates  
- **Stack recreated?** ✅ Automatic detection

Just push your code and let the system decide the best deployment strategy!

**Manual Trigger**: `aws codebuild start-build --project-name chronas-api-lambda-deploy-standalone --profile chronas-dev`