import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @ApiOperation({ summary: 'Process liveness' })
  health() { return { status: 'ok', service: 'fieldops-api' }; }
  @Get('ready')
  @ApiOperation({ summary: 'Database readiness' })
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok', database: 'connected' }; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
  }
}
