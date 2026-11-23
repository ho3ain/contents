import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ScaleReferralService } from './referral.service';
import { CommunityService } from './community.service';

/**
 * Phase C5 §4, §43 — the public surface.
 *
 * Two endpoints, both unauthenticated, both deliberately forgiving:
 *
 *  - `GET /public/r/:code` resolves a share link and records the click.
 *  - `GET /public/community` is a read-only feed.
 *
 * `GET /public/r/:code` NEVER 404s for a bad code. §43 is explicit that
 * creators share from a phone, and a link that returns an error page after
 * somebody tapped it is a share that silently did nothing. An unknown code
 * resolves to `null` and the SPA still renders its landing page — the click
 * simply has no referrer, which is the truth.
 */
@Controller('public')
export class ScalePublicController {
  constructor(
    private readonly referrals: ScaleReferralService,
    private readonly community: CommunityService,
  ) {}

  /**
   * §4/§43 — resolve and record. Rate limited so a link cannot be used to
   * inflate somebody else's click count.
   */
  @Public()
  @Get('r/:code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async resolve(@Param('code') code: string) {
    const resolved = await this.referrals.resolveCode(code);
    if (!resolved) return { code, referrer: null, recorded: false };
    const recorded =
      resolved.kind === 'creator'
        ? await this.referrals.recordCreatorClick(code)
        : true;
    return {
      code,
      // `kind` is what the client uses to attribute the eventual signup. The
      // creator profile id is NOT returned: a public endpoint handing out
      // profile ids is an enumeration primitive.
      referrer: { kind: resolved.kind },
      recorded,
    };
  }

  /**
   * §30 — the community feed, readable without an account so a creator can
   * see what they would be joining before they accept the invitation.
   *
   * Only post metadata is exposed. Bodies and author emails stay behind the
   * authenticated routes: a public feed is a marketing surface, and it is
   * not the place to publish a half-written question.
   */
  @Public()
  @Get('community')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async feed() {
    return this.community.publicFeed(20);
  }
}
