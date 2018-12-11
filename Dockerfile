# take default image of node boron i.e  node 6.x
FROM node:10

# create app directory in container
RUN mkdir -p /app

# set /app directory as default working directory
WORKDIR /app

# only copy package.json initially so that `RUN npm start` layer is recreated only
# if there are changes in package.json
ADD dist/package.json /app/

ENV NODE_ENV=production

ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017
ENV PORT=80
ENV CHRONAS_HOST=https://chronas.org
ENV FACEBOOK_CALLBACK_URL=https://api.chronas.org/v1/auth/login/facebook?cb
ENV GOOGLE_CALLBACK_URL=https://api.chronas.org/v1/auth/login/google?cb
ENV GITHUB_CALLBACK_URL=https://api.chronas.org/v1/auth/login/github?cb
ENV TWITTER_CALLBACK_URL=https://api.chronas.org/v1/auth/login/twitter

RUN npm install --production --silent

# copy all file from current dir to /app in container
COPY dist /app/

# expose port 4040
EXPOSE 80

# cmd to start service
CMD [ "node", "index.js" ]
