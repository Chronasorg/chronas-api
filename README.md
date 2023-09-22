[![Build Status](https://dev.azure.com/chronas/chronas/_apis/build/status/Chronasorg.chronas-api?branchName=master)](https://dev.azure.com/chronas/chronas/_build/latest?definitionId=1?branchName=master)

# [Chronas](https://github.com/daumann/chronas) API

## Overview

This API provides authentication and CRUD operations for data used by the Chronas application. 
It is based on Node.js using ES6 and Express with Code Coverage and JWT Authentication. It implies an underlying MongoDB.

### Technologies used

| Feature                                | Summary                                                                                                                                                                                                                                                     |
|----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ES6 via Babel                  	 	 | ES6 support using [Babel](https://babeljs.io/).  |
| Authentication via JsonWebToken                  	 	 | Supports authentication using [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken).  |
| Code Linting               			 | JavaScript code linting is done using [ESLint](http://eslint.org) - a pluggable linter tool for identifying and reporting on patterns in JavaScript. Uses ESLint with [eslint-config-airbnb](https://github.com/airbnb/javascript/tree/master/packages/eslint-config-airbnb), which tries to follow the Airbnb JavaScript style guide.                                                                                                |
| Auto server restart                  	 | Restart the server using [nodemon](https://github.com/remy/nodemon) in real-time anytime an edit is made, with babel compilation and eslint. |
| Swagger               	 | Using [swagger-ui-express](https://www.npmjs.com/package/swagger-ui-express) Path to Docu [/api-docs](https://api.chronas.org/api-docs) |
| Postman | [Here](https://documenter.getpostman.com/view/2687480/RznBMKeh) you can find the Postman Dokumentation  and the Postman test collection and environment can be found [here](PostmanTests) |
| ES6 Code Coverage via [istanbul](https://www.npmjs.com/package/istanbul)                  | Supports code coverage of ES6 code using istanbul and mocha. Code coverage reports are saved in `coverage/` directory post `npm test` execution. Open `coverage/lcov-report/index.html` to view coverage report. `npm test` also displays code coverage summary on console. Code coverage can also be enforced overall and per file as well, configured via .istanbul.yml                                                                                                                                                                            |
| Debugging via [debug](https://www.npmjs.com/package/debug)           | Instead of inserting and deleting console.log you can replace it with the debug function and just leave it there. You can then selectively debug portions of your code by setting DEBUG env variable. If DEBUG env variable is not set, nothing is displayed to the console.                       |
| Promisified Code via [bluebird](https://github.com/petkaantonov/bluebird)           | We love promise, don't we ? All our code is promisified and even so our tests via [supertest-as-promised](https://www.npmjs.com/package/supertest-as-promised).                       |
| API parameter validation via [express-validation](https://www.npmjs.com/package/express-validation)           | Validate body, params, query, headers and cookies of a request (via middleware) and return a response with errors; if any of the configured validation rules fail. You won't anymore need to make your route handler dirty with such validations. |
| Pre-commit hooks           | Runs lint and tests before any commit is made locally, making sure that only tested and quality code is committed |
| Secure app via [helmet](https://github.com/helmetjs/helmet)           | Helmet helps secure Express apps by setting various HTTP headers. |
| Infrastructure Information           |  [MongoDB Restore in K8s to Azure](infrastructure/kubernetes/mongo_backup/README.md),  [Create MongoDB in K8s](infrastructure/kubernetes/mongo/README.md) |

- CORS support via [cors](https://github.com/expressjs/cors)
- Uses [http-status](https://www.npmjs.com/package/http-status) to set http status code. It is recommended to use `httpStatus.INTERNAL_SERVER_ERROR` instead of directly using `500` when setting status code.
- Has `.editorconfig` which helps developers define and maintain consistent coding styles between different editors and IDEs.

## Getting Started

Clone the repo:
```sh
git clone https://github.com/Chronasorg/chronas-api
```

Install dependencies:
```sh
cd chronas-api
npm i
```

Set environment (vars):
```sh
cp .env.example .env
```

Start an local mongoDB instance e.g. with an docker container:

```sh
docker run -d --name mongodatabase -p27017:27017 mongo
```

Start:

```sh
npm start

# Selectively set DEBUG env var to get logs
DEBUG=chronas-api:* npm start
```
Refer [debug](https://www.npmjs.com/package/debug) to know how to selectively turn on logs.


Tests:
```sh
# Run tests written in ES6 
npm test

# Run test along with code coverage
npm run test:coverage

# Run tests on file change
npm run test:watch
```

Lint:
```sh
# Lint code with ESLint
npm run lint

# Run lint on any file change
npm run lint:watch
```

Other gulp tasks:
```sh
# Wipe out dist and coverage directory
gulp clean

# Default task: Wipes out dist and coverage directory. Compiles using babel.
gulp
```

##### Deployment

```sh
# compile to ES5
1. npm run build

# upload dist/ to your server
2. scp -rp dist/ user@dest:/path

# install production dependencies only
3. npm install --production

# Use any process manager to start your services
4. pm2 start dist/index.js
```

In production you need to make sure your server is always up so you should ideally use any of the process manager recommended [here](http://expressjs.com/en/advanced/pm.html).
We recommend [pm2](http://pm2.keymetrics.io/) as it has several useful features like it can be configured to auto-start your services if system is rebooted.

#### API logging
Logs detailed info about each api request to console during development.
![Detailed API logging](https://cloud.githubusercontent.com/assets/4172932/12563354/f0a4b558-c3cf-11e5-9d8c-66f7ca323eac.JPG)

#### Error logging
Logs stacktrace of error to console along with other details.
![Error logging](https://cloud.githubusercontent.com/assets/4172932/12563361/fb9ef108-c3cf-11e5-9a58-3c5c4936ae3e.JPG)

## Docker

The [Dockerfile](Dockerfile) contains a multistage build. It installs node models and builds the application on a base node image and copy it to an node-alphine image.

To run the application use docker-compose as it will start also a mongodb:

```bash
docker-compose up
```

If you want to run it without docker-compose use this commands:

```bash
docker run -d -p27017:27017 --name mongodatabase mongo
```

```bash
docker build -t chronas-api-local . && docker run -it --link mongodatabase:mongodatabase -e MONGO_HOST='MONGO_HOST=mongodb://mongodatabase/chronas-api' --name chrona-api -p 80:80 chronas-api-local
```
