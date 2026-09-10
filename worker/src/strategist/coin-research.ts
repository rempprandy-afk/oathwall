/**
 * Looking a coin up before deciding anything about it.
 *
 * WHERE THIS SITS. The screen decides what is worth LOOKING at, using numbers
 * from an index. The scout decides what is worth BUYING, using a model. Between
 * them there was nothing that actually looked — and "does this coin have anyone
 * behind it" is the question a person answers first and this agent could not
 * answer at all.
 *
 * IT FEEDS THE SCOUT RATHER THAN REPORTING BESIDE IT. An earlier shape wrote
 * research to its own table and left the model deciding on the same numbers as
 * before, which would have made the browser expensive theatre. The signals go
 * into the candidate list the model ranks, so a site that never names its own
 * contract is something the model can weigh against a coin's volume.
 *
 * WHAT THE MODEL SEES IS STILL NOT AN ADDRESS. memecoin-scout deliberately shows
 * no address and takes answers as indices into the list it was handed; that
 * property is load-bearing and survives here. Site signals are booleans and
 * counts, which cannot name a token either.
 *
 * BOUNDED, BECAUSE A BROWSER IS THE MOST EXPENSIVE THING IN THE FLEET. One page
 * at a time, a hard ceiling per pass, and only for coins that published a site
 * worth visiting. A pass that researches nothing is a normal pass.
 */

import type { PublicClient } from "viem";
import type { GeckoPool } from "../venues/geckoterminal";
import { TOKEN_METADATA_SOURCE } from "../venues/token-meta";
import {
  readPage,
  signalsFrom,
  describeSignals,
  type BrowserConfig,
  type SiteSignals,
} from "../venues/research";

/**
 * How many coins one pass will visit.
 *
 * The browser serves one page at a time and a page takes a few seconds, so this
 * is a wall-clock budget as much as a cost one. Six keeps a discovery pass under
 * half a minute even when every site is slow, and the screen has already cut the
 * field to the handful worth the trouble.
 */
export const RESEARCH_PER_PASS = 6;

export interface CoinResearch {
  token: `0x${string}`;
  /** What its website actually said. Absent when there was nothing to visit. */
  site: SiteSignals | null;
  /** One line for a human, and for the decision row. */
  summary: string;
}

/**
 * Where the website to visit comes from, or null when nothing can supply one.
 *
 * A SEPARATE INJECTION FROM `fetchPage`, and that split is the point. The
 * browser still works; what the chain move removed is the thing that told it
 * WHICH page to open. Keeping them separate means wiring Four.meme later is
 * supplying this function, not rebuilding the lane.
 */
export type SiteSource = (
  client: PublicClient,
  tokens: readonly `0x${string}`[],
) => Promise<Map<string, { website: string; twitter: string }>>;

/** Everything research needs, injected so the pipeline is testable offline. */
export interface ResearchDeps {
  client: PublicClient;
  browser: BrowserConfig | null;
  /**
   * Injected for tests, and by a future launchpad reader. Defaults to
   * TOKEN_METADATA_SOURCE, which is null on BNB — see below.
   */
  fetchSites?: SiteSource | null;
  fetchPage?: typeof readPage;
  limit?: number;
}

/** What a pass reports when nothing on this chain can name a site to visit. */
export const NO_SITE_SOURCE = "no launchpad metadata on this chain — nothing to visit";

/**
 * Research a shortlist of coins.
 *
 * Never throws into a discovery pass. A coin whose site is down is a coin whose
 * site is down — a fact worth recording, not an error worth stopping for.
 *
 * ⚠ ON BNB THIS LANE IS OFF, AND IT SAYS SO. Every coin comes back with
 * `summary: NO_SITE_SOURCE` rather than the "site not visited" line, which used
 * to mean "this one published nothing" and would now mean "no coin can publish
 * anything". The distinction is the whole reason this branch is written out
 * instead of falling out of an empty map: a lane that researches nothing must
 * not be indistinguishable from a lane that researched and found nothing.
 */
export async function researchCoins(
  pools: readonly GeckoPool[],
  deps: ResearchDeps,
): Promise<Map<string, CoinResearch>> {
  const out = new Map<string, CoinResearch>();
  if (!pools.length) return out;

  const fetchSites = deps.fetchSites === undefined ? TOKEN_METADATA_SOURCE : deps.fetchSites;
  const fetchPage = deps.fetchPage ?? readPage;

  if (!fetchSites) {
    for (const p of pools) {
      out.set(p.tokenAddress.toLowerCase(), { token: p.tokenAddress, site: null, summary: NO_SITE_SOURCE });
    }
    return out;
  }

  // One batched call for every coin's published site — cheap, and it decides
  // which of them are even worth a page visit.
  let sites = new Map<string, { website: string; twitter: string }>();
  try {
    sites = await fetchSites(deps.client, pools.map((p) => p.tokenAddress));
  } catch {
    /* the chain read failing is not a reason to skip the rest */
  }

  // Visit only coins that published a site. A coin with no website is not
  // researched and is not thereby condemned: `site: null` means "nothing to
  // visit", which the model reads differently from "visited and empty".
  const withSite = pools.filter((p) => (sites.get(p.tokenAddress.toLowerCase())?.website ?? "").length > 0);
  const budget = deps.limit ?? RESEARCH_PER_PASS;

  for (const p of pools) {
    const s = sites.get(p.tokenAddress.toLowerCase()) ?? null;
    // THREE STATES, NOT TWO, and the map is what separates them. A coin ABSENT
    // from it was not read — the source returns a map precisely so a caller can
    // tell that from "read and empty". Present with no website published
    // nothing, which is a claim about the coin and may only be made when the
    // read actually succeeded; the same distinction the launchpad cards got
    // wrong by rendering every unread coin as one that published nothing.
    out.set(p.tokenAddress.toLowerCase(), {
      token: p.tokenAddress,
      site: null,
      summary: !s
        ? "no on-chain metadata"
        : s.website
          ? "published claims, site not visited"
          : "published nothing about itself",
    });
  }

  let spent = 0;
  for (const p of withSite) {
    if (spent >= budget) break;
    spent++;
    const s = sites.get(p.tokenAddress.toLowerCase())!;
    const read = await fetchPage(deps.browser, s.website);
    const site = signalsFrom({ read, token: p.tokenAddress, claimedSocial: s.twitter });
    out.set(p.tokenAddress.toLowerCase(), { token: p.tokenAddress, site, summary: describeSignals(site) });
  }
  return out;
}

/**
 * The research fields the model is shown, alongside the market numbers.
 *
 * Booleans and counts only — never the page text, and never an address. Handing
 * a model launcher-written prose to reason over is handing it an instruction
 * channel; `siteHype: 3` is a number it can weigh and cannot be told by.
 */
export interface ScoutSiteFields {
  /** null = nothing published to visit. false = published a site that did not answer. */
  siteReachable: boolean | null;
  siteNamesContract: boolean | null;
  siteTextLength: number | null;
  siteOutboundDomains: number | null;
  siteHypeWords: number | null;
}

/**
 * `publishedNothing` USED TO BE HERE and was removed with the metadata reader.
 *
 * It meant "the launcher filled in no description and no socials at all" — an
 * abandoned template — and it came from `TokenMeta.bare`. With no source for
 * that on BNB it could only ever have been null, and it was also a line in the
 * scout's PROMPT telling the model what the field means. A prompt describing a
 * signal the model will never receive is worse than one field short.
 */

export function scoutFieldsFor(r: CoinResearch | undefined): ScoutSiteFields {
  if (!r) {
    return {
      siteReachable: null,
      siteNamesContract: null,
      siteTextLength: null,
      siteOutboundDomains: null,
      siteHypeWords: null,
    };
  }
  return {
    siteReachable: r.site ? r.site.reachable : null,
    siteNamesContract: r.site ? r.site.mentionsContract : null,
    siteTextLength: r.site ? r.site.textLength : null,
    siteOutboundDomains: r.site ? r.site.outboundDomains : null,
    siteHypeWords: r.site ? r.site.hypeWords : null,
  };
}
