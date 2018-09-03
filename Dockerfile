# initial stage for building the project
FROM node:10 as builder

# set /app directory as default working directory
WORKDIR /app

ENV NODE_ENV=development
ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017
ENV PORT=80

# only copy package.json initially so that `RUN npm start` layer is recreated only
# if there are changes in package.json
ADD package.json .
RUN npm install
# copy all file from current dir to /app in container
COPY . .
RUN npm run build

WORKDIR /app/dist
RUN npm install --production --silent

# final stage for running the app
FROM node:10-alpine
# set /app directory as default working directory
WORKDIR /app

COPY --from=builder /app/dist /app/
# expose port 80
EXPOSE 80
# cmd to start service
CMD [ "node", "index.js" ]