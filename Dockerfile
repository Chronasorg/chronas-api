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

ARG BUILD_ID=123

#update commit and build id
RUN npm install appversion -g \
	&& apv set-version 1.0.$BUILD_ID \
	&& apv update commit \
	&& apv update build

# Build the app and run the tests
RUN npm run build \
	&& npm test

WORKDIR /app/dist

# --- Release with Alpine ----
FROM node:10-alpine AS release
# Create app directory
WORKDIR /app

#  --- add env variables ---
ENV NODE_ENV=production
ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017
ENV PORT=80

ENV APPINSIGHTS_INSTRUMENTATIONKEY=placeholder
ENV TWITTER_CONSUMER_KEY=placeholder
ENV TWITTER_CONSUMER_SECRET=placeholder
ENV TWITTER_CALLBACK_URL=placeholder
ENV JWT_SECRET=placeholder
ENV MAILGUN_KEY=placeholder

ENV CHRONAS_HOST=https://chronas.org
ENV FACEBOOK_CALLBACK_URL=https://api.chronas.org/v1/auth/login/facebook?cb
ENV GOOGLE_CALLBACK_URL=https://api.chronas.org/v1/auth/login/google?cb
ENV GITHUB_CALLBACK_URL=https://api.chronas.org/v1/auth/login/github?cb
ENV TWITTER_CALLBACK_URL=https://api.chronas.org/v1/auth/login/twitter

# copy app from build
COPY --from=build /app/dist/ ./

#workaround to install python for bcrypt
RUN apk update && apk upgrade \
	&& apk add --no-cache git \
	&& apk --no-cache add --virtual builds-deps build-base python \
	&& npm install --production\
	&& npm rebuild bcrypt --build-from-source \
	&& apk del builds-deps

EXPOSE 80

# cmd to start service
CMD [ "node", "index.js" ]
