# take default image of node boron i.e  node 6.x
FROM node:6.10.1

# create app directory in container
RUN mkdir -p /app

# set /app directory as default working directory
WORKDIR /app

# only copy package.json initially so that `RUN npm start` layer is recreated only
# if there are changes in package.json
ADD package.json package-lock.json /app/

ENV JWT_SECRET=0a6b944d-d2fb-46fc-a85e-0295c986cd9f
ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017

RUN npm install --silent

# copy all file from current dir to /app in container
COPY . /app/

# expose port 4040
EXPOSE 4040

# cmd to start service
CMD [ "npm", "start" ]
