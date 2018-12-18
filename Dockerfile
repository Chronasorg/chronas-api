#https://blog.hasura.io/an-exhaustive-guide-to-writing-dockerfiles-for-node-js-web-apps-bbee6bd2f3c4
# ---- Base Node ----
FROM node:10 AS base
# Create app directory
WORKDIR /app

# ---- Dependencies ----
FROM base AS dependencies  
COPY package.json ./
# install app dependencies including 'devDependencies'
RUN npm install

# ---- Copy Files/Build ----
FROM dependencies AS build  
WORKDIR /app
COPY . /app
# Build the app
RUN npm run build
WORKDIR /app/dist
# install npm models in dist
RUN npm install --only=production

# --- Release with Alpine ----
FROM node:10-alpine AS release  
# Create app directory
WORKDIR /app
# optional
ENV NODE_ENV=development
ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017
ENV PORT=80
ENV APPINSIGHTS_INSTRUMENTATIONKEY=placeholder
ENV TWITTER_CONSUMER_KEY=placeholder
ENV TWITTER_CONSUMER_SECRET=placeholder
ENV TWITTER_CALLBACK_URL=placeholder
ENV JWT_SECRET=placeholder
ENV CHRONAS_HOST=https://chronas.org
ENV FACEBOOK_CALLBACK_URL=https://api.chronas.org/v1/auth/login/facebook?cb
ENV GOOGLE_CALLBACK_URL=https://api.chronas.org/v1/auth/login/google?cb
ENV GITHUB_CALLBACK_URL=https://api.chronas.org/v1/auth/login/github?cb
ENV TWITTER_CALLBACK_URL=https://api.chronas.org/v1/auth/login/twitter

# copy app from build
COPY --from=build /app/dist/ ./
CMD ["node", "index.js"]

RUN npm install --production --silent

# copy all file from current dir to /app in container
COPY dist /app/

# expose port 4040
EXPOSE 80

# cmd to start service
CMD [ "node", "index.js" ]
