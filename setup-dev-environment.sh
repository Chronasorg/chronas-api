#!/bin/bash

# Chronas API Development Environment Setup Script
# This script sets up and verifies the development environment for API modernization

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Chronas API Development Environment Setup${NC}"
echo "Setting up environment for API modernization"
echo "----------------------------------------"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Check current branch
log "Checking current git branch..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "feature/modernize-api" ]; then
    warn "Not on feature/modernize-api branch"
    info "Current branch: $CURRENT_BRANCH"
    
    # Check if feature branch exists
    if git show-ref --verify --quiet refs/heads/feature/modernize-api; then
        info "Feature branch exists, switching to it..."
        git checkout feature/modernize-api
    else
        info "Creating feature/modernize-api branch..."
        git checkout -b feature/modernize-api
    fi
else
    success "Already on feature/modernize-api branch"
fi

# Check Node.js version
log "Checking Node.js version..."
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')

echo "Node.js version: $NODE_VERSION"

if [ "$NODE_MAJOR" -ge 22 ]; then
    success "Node.js version is compatible (>= 22.x)"
else
    error "Node.js version $NODE_VERSION is too old. Requires Node.js 22.x or higher"
fi

# Check npm version
log "Checking npm version..."
NPM_VERSION=$(npm --version)
NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d'.' -f1)

echo "npm version: $NPM_VERSION"

if [ "$NPM_MAJOR" -ge 9 ]; then
    success "npm version is compatible (>= 9.x)"
else
    warn "npm version $NPM_VERSION is older. Consider upgrading to npm 10+"
fi

# Check if package-lock.json exists
log "Checking package lock file..."
if [ -f "package-lock.json" ]; then
    success "package-lock.json exists"
    
    # Check lock file version
    LOCKFILE_VERSION=$(jq -r '.lockfileVersion // 1' package-lock.json 2>/dev/null || echo "1")
    echo "Lock file version: $LOCKFILE_VERSION"
    
    if [ "$LOCKFILE_VERSION" -ge 3 ]; then
        success "Lock file version is modern (v$LOCKFILE_VERSION)"
    else
        warn "Lock file version is older (v$LOCKFILE_VERSION). Consider regenerating with npm install"
    fi
else
    warn "package-lock.json not found. Will be created during npm install"
fi

# Check current dependencies
log "Analyzing current dependencies..."

# Check critical outdated dependencies
MONGOOSE_VERSION=$(jq -r '.dependencies.mongoose // "not found"' package.json)
AWS_SDK_VERSION=$(jq -r '.dependencies["aws-sdk"] // "not found"' package.json)
EXPRESS_VERSION=$(jq -r '.dependencies.express // "not found"' package.json)

echo "Current versions:"
echo "  - Mongoose: $MONGOOSE_VERSION"
echo "  - AWS SDK: $AWS_SDK_VERSION"
echo "  - Express: $EXPRESS_VERSION"

# Validate versions
if [[ "$MONGOOSE_VERSION" =~ ^5\. ]]; then
    warn "Mongoose $MONGOOSE_VERSION is outdated (target: 8.x)"
else
    info "Mongoose version: $MONGOOSE_VERSION"
fi

if [[ "$AWS_SDK_VERSION" =~ ^2\. ]]; then
    warn "AWS SDK $AWS_SDK_VERSION is v2 (target: v3 modular packages)"
else
    info "AWS SDK version: $AWS_SDK_VERSION"
fi

if [[ "$EXPRESS_VERSION" =~ ^4\.16\. ]]; then
    warn "Express $EXPRESS_VERSION is outdated (target: latest 4.x)"
else
    info "Express version: $EXPRESS_VERSION"
fi

# Check for security vulnerabilities
log "Checking for security vulnerabilities..."
if command -v npm &> /dev/null; then
    npm audit --audit-level=high --json > audit-results.json 2>/dev/null || true
    
    if [ -f "audit-results.json" ]; then
        VULNERABILITIES=$(jq -r '.metadata.vulnerabilities.total // 0' audit-results.json 2>/dev/null || echo "0")
        HIGH_VULNS=$(jq -r '.metadata.vulnerabilities.high // 0' audit-results.json 2>/dev/null || echo "0")
        CRITICAL_VULNS=$(jq -r '.metadata.vulnerabilities.critical // 0' audit-results.json 2>/dev/null || echo "0")
        
        echo "Security audit results:"
        echo "  - Total vulnerabilities: $VULNERABILITIES"
        echo "  - High severity: $HIGH_VULNS"
        echo "  - Critical severity: $CRITICAL_VULNS"
        
        if [ "$CRITICAL_VULNS" -gt 0 ] || [ "$HIGH_VULNS" -gt 0 ]; then
            warn "High/Critical vulnerabilities found. Address during dependency updates"
        else
            success "No high/critical vulnerabilities found"
        fi
        
        rm -f audit-results.json
    fi
fi

# Check AWS CLI and profile
log "Checking AWS configuration..."
if command -v aws &> /dev/null; then
    if aws sts get-caller-identity --profile chronas-dev --region eu-west-1 > /dev/null 2>&1; then
        ACCOUNT_ID=$(aws sts get-caller-identity --profile chronas-dev --region eu-west-1 --query 'Account' --output text)
        success "AWS CLI configured with chronas-dev profile (Account: $ACCOUNT_ID)"
    else
        warn "AWS CLI not configured properly for chronas-dev profile"
    fi
else
    warn "AWS CLI not installed"
fi

# Check Docker (for local development)
log "Checking Docker availability..."
if command -v docker &> /dev/null; then
    if docker info > /dev/null 2>&1; then
        success "Docker is available and running"
    else
        warn "Docker is installed but not running"
    fi
else
    info "Docker not installed (optional for development)"
fi

# Check MongoDB tools (for migration testing)
log "Checking MongoDB tools..."
MONGO_TOOLS=("mongosh" "mongoexport" "mongoimport")
MONGO_TOOLS_AVAILABLE=0

for tool in "${MONGO_TOOLS[@]}"; do
    if command -v "$tool" &> /dev/null; then
        success "$tool is available"
        MONGO_TOOLS_AVAILABLE=$((MONGO_TOOLS_AVAILABLE + 1))
    else
        warn "$tool not found (needed for migration testing)"
    fi
done

if [ "$MONGO_TOOLS_AVAILABLE" -eq 0 ]; then
    warn "No MongoDB tools found. Install MongoDB tools for migration testing:"
    echo "  brew install mongodb/brew/mongodb-community"
fi

# Create development environment summary
log "Creating development environment summary..."

DEV_SUMMARY="dev-environment-summary.md"

cat > "$DEV_SUMMARY" << EOF
# Development Environment Summary

**Setup Date**: $(date)
**Branch**: $(git branch --show-current)
**Node.js Version**: $NODE_VERSION
**npm Version**: $NPM_VERSION

## Environment Status

### ✅ Requirements Met
- Node.js >= 22.x: **$NODE_VERSION** ✓
- npm >= 9.x: **$NPM_VERSION** ✓
- Git branch: **$(git branch --show-current)** ✓
- AWS CLI configured: **$(aws sts get-caller-identity --profile chronas-dev --region eu-west-1 --query 'Account' --output text 2>/dev/null || echo 'Not configured')**

### 📦 Current Dependencies (Pre-Modernization)
- **Mongoose**: $MONGOOSE_VERSION (target: 8.x)
- **AWS SDK**: $AWS_SDK_VERSION (target: v3 modular)
- **Express**: $EXPRESS_VERSION (target: latest 4.x)

### 🔧 Development Tools
- **Docker**: $(command -v docker &> /dev/null && echo "Available" || echo "Not installed")
- **MongoDB Tools**: $MONGO_TOOLS_AVAILABLE/3 tools available

### 🛡️ Security Status
$(if [ -f "audit-results.json" ]; then
    echo "- **Vulnerabilities**: $VULNERABILITIES total"
    echo "- **High/Critical**: $((HIGH_VULNS + CRITICAL_VULNS))"
else
    echo "- **Security Audit**: Will be checked during dependency updates"
fi)

## Next Steps

1. **Update package.json** with Node.js 22.x engines field
2. **Upgrade dependencies** to modern versions
3. **Test compatibility** with new versions
4. **Update build and deployment scripts**

## Development Workflow

### Local Development
\`\`\`bash
# Install dependencies
npm install

# Start development server
npm start

# Run tests
npm test

# Run linting
npm run lint
\`\`\`

### Migration Testing
\`\`\`bash
# Test new cluster connection
node migration/test-new-cluster-connection.js dev

# Test rollback procedures
./migration/test-rollback-procedures.sh dev

# Execute migration (dry run)
./migration/execute-migration.sh dev true
\`\`\`

## Important Notes

- **Feature Branch**: All modernization work happens on \`feature/modernize-api\`
- **AWS Profile**: Use \`chronas-dev\` profile for all AWS operations
- **Region**: \`eu-west-1\` for all AWS resources
- **Testing**: Always test locally before deploying to AWS

---

*Environment setup completed successfully*
*Ready for API modernization tasks*
EOF

success "Development environment setup completed!"
echo "----------------------------------------"
echo -e "${GREEN}Environment Summary:${NC}"
echo "Branch: $(git branch --show-current)"
echo "Node.js: $NODE_VERSION"
echo "npm: $NPM_VERSION"
echo "AWS Profile: chronas-dev"
echo "Summary: $DEV_SUMMARY"
echo "----------------------------------------"

log "Development environment is ready for API modernization!"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Review environment summary: $DEV_SUMMARY"
echo "2. Update package.json with Node.js 22.x requirement"
echo "3. Begin dependency modernization (Task 3)"
echo "4. Test compatibility with new versions"