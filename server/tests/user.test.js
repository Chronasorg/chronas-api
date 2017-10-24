import mongoose from 'mongoose'
import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import jwt from 'jsonwebtoken'
import chai, { expect } from 'chai'
import config from '../../config/config'
import app from '../../index'

chai.config.includeStack = true

/**
 * root level hooks
 */
after((done) => {
  // required because https://github.com/Automattic/mongoose/issues/1251#issuecomment-65793092
  mongoose.models = {}
  mongoose.modelSchemas = {}
  mongoose.connection.close()
  done()
})

describe('## User APIs', () => {
  const validUserCredentials = {
    username: 'react',
    password: 'express'
  }

  let user = {
    id: 1,
    username: 'KK123',
    privilege: 'public'
  }

  let jwtToken

  describe('# POST /v1/auth/login', () => {
    it('should get valid JWT token', (done) => {
      request(app)
        .post('/v1/auth/login')
        .send(validUserCredentials)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('token')
          jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
            expect(err).to.not.be.ok // eslint-disable-line no-unused-expressions
            expect(decoded.username).to.equal(validUserCredentials.username)
            jwtToken = `Bearer ${res.body.token}`
            done()
          })
        })
        .catch(done)
    })
  })

  describe('# POST /v1/users', () => {
    it('should create a new user', (done) => {
      request(app)
        .post('/v1/users')
        .set('Authorization', jwtToken)
        .send(user)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal(user.username)
          expect(res.body.privilege).to.equal(user.privilege)
          user = res.body
          done()
        })
        .catch(done)
    })
  })

  describe('# GET /v1/users/', () => {
    it('should get all users', (done) => {
      request(app)
        .get('/v1/users')
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.be.an('array')
          done()
        })
        .catch(done)
    })
  })
/*
  describe('# GET /v1/users/:userId', () => {
    it('should get user details', (done) => {
      request(app)
        .get(`/v1/users/${user._id}`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal(user.username)
          expect(res.body.privilege).to.equal(user.privilege)
          done()
        })
        .catch(done)
    })

    it('should report error with message - Not found, when user does not exists', (done) => {
      request(app)
        .get('/v1/users/56c787ccc67fc16ccc1a5e92')
        .set('Authorization', jwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then((res) => {
          expect(res.body.message).to.equal('Not Found')
          done()
        })
        .catch(done)
    })
  })

  describe('# PUT /v1/users/:userId', () => {
    it('should update user details', (done) => {
      user.username = 'KK'
      request(app)
        .put(`/v1/users/${user._id}`)
        .set('Authorization', jwtToken)
        .send(user)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal('KK')
          expect(res.body.privilege).to.equal(user.privilege)
          done()
        })
        .catch(done)
    })
  })

  describe('# DELETE /v1/users/', () => {
    it('should delete user', (done) => {
      request(app)
        .delete(`/v1/users/${user._id}`)
        .set('Authorization', jwtToken)
        .expect(204)
        .then((res) => {
          expect(res.body.username).to.equal('KK')
          expect(res.body.privilege).to.equal(user.privilege)
          done()
        })
        .catch(done)
    })
  })
  */
})
