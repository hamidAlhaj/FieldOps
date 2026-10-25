import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';
describe('Health HTTP endpoints', () => {
  let app: INestApplication;
  const query = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController], providers: [{ provide: PrismaService, useValue: { $queryRaw: query } }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(() => app.close());
  it('returns liveness', async () => { await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok', service: 'fieldops-api' }); });
  it('returns readiness when database responds', async () => { query.mockResolvedValueOnce([{ '?column?': 1 }]); await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200); });
  it('returns 503 when database fails', async () => { query.mockRejectedValueOnce(new Error('offline')); await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503); });
});
