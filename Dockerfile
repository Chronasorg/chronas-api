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

# copy app from build
COPY --from=build /app/dist/ ./
CMD ["node", "index.js"]