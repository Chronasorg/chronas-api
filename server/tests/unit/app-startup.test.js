import { describe, it } from 'mocha';
import { expect } from 'chai';

describe('## Application Startup Tests', () => {
  describe('# Core Module Loading', () => {
    it('should load winston logger without errors', async () => {
      try {
        const winston = await import('../../../config/winston.js');
        expect(winston.default).to.exist;
      } catch (error) {
        throw new Error(`Winston logger failed to load: ${error.message}`);
      }
    });

    it('should load application config without errors', async () => {
      try {
        const { config } = await import('../../../config/config.js');
        expect(config).to.exist;
        expect(config.env).to.equal('test');
      } catch (error) {
        throw new Error(`Application config failed to load: ${error.message}`);
      }
    });
  });

  describe('# Helper Modules', () => {
    it('should load APIError helper without errors', async () => {
      try {
        const APIError = await import('../../helpers/APIError.js');
        expect(APIError.default).to.be.a('function');
      } catch (error) {
        throw new Error(`APIError helper failed to load: ${error.message}`);
      }
    });

    it('should load performance middleware without errors', async () => {
      try {
        const { createPerformanceMiddleware } = await import('../../../config/performance.js');
        expect(createPerformanceMiddleware).to.be.a('function');
      } catch (error) {
        throw new Error(`Performance middleware failed to load: ${error.message}`);
      }
    });
  });

  describe('# Model Loading', () => {
    const models = ['user.model.js', 'area.model.js', 'marker.model.js', 'metadata.model.js'];

    models.forEach(modelFile => {
      it(`should load ${modelFile} without errors`, async () => {
        try {
          const model = await import(`../../models/${modelFile}`);
          expect(model.default).to.exist;
        } catch (error) {
          throw new Error(`Model ${modelFile} failed to load: ${error.message}`);
        }
      });
    });
  });

  describe('# Controller Loading', () => {
    const controllers = [
      'user.controller.js',
      'area.controller.js',
      'marker.controller.js',
      'metadata.controller.js',
      'auth.controller.js'
    ];

    controllers.forEach(controllerFile => {
      it(`should load ${controllerFile} without errors`, async () => {
        try {
          const controller = await import(`../../controllers/${controllerFile}`);
          expect(controller.default).to.exist;
        } catch (error) {
          throw new Error(`Controller ${controllerFile} failed to load: ${error.message}`);
        }
      });
    });
  });

  describe('# Route Loading', () => {
    const routes = [
      'user.route.js',
      'area.route.js',
      'marker.route.js',
      'metadata.route.js',
      'auth.route.js',
      'version.router.js'
    ];

    routes.forEach(routeFile => {
      it(`should load ${routeFile} without errors`, async () => {
        try {
          const route = await import(`../../routes/${routeFile}`);
          expect(route.default).to.exist;
        } catch (error) {
          throw new Error(`Route ${routeFile} failed to load: ${error.message}`);
        }
      });
    });
  });

  describe('# Express Application', () => {
    it('should create express app without errors', async () => {
      try {
        const expressApp = await import('../../../config/express.js');
        expect(expressApp.default).to.exist;
      } catch (error) {
        throw new Error(`Express app failed to load: ${error.message}`);
      }
    });
  });

  describe('# Web Function entry', () => {
    it('should load the bootstrap without errors', async () => {
      const { createApp, loadSecrets } = await import('../../../config/bootstrap.js');
      expect(createApp).to.be.a('function');
      expect(loadSecrets).to.be.a('function');
    });
  });

  describe('# Utility Scripts', () => {
    const utilityScripts = [
      'run-postman-tests.js',
      'setup-test-environment.js'
    ];

    utilityScripts.forEach(scriptFile => {
      it(`should load script ${scriptFile} without errors`, async () => {
        try {
          const script = await import(`../../../scripts/${scriptFile}`);
          expect(script).to.exist;
        } catch (error) {
          throw new Error(`Script ${scriptFile} failed to load: ${error.message}`);
        }
      });
    });
  });
});
