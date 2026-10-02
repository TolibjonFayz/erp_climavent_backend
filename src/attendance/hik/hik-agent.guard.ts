import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

// Ofisdagi hik-agent uchun: `x-hik-agent-key` sarlavhasi HIK_AGENT_KEY ga teng bo'lishi kerak.
@Injectable()
export class HikAgentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.HIK_AGENT_KEY;
    const given = context.switchToHttp().getRequest().headers['x-hik-agent-key'];
    if (!expected || typeof given !== 'string') {
      throw new UnauthorizedException('Agent unauthorized');
    }
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Agent unauthorized');
    }
    return true;
  }
}
