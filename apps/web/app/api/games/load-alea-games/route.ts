import { NextResponse } from 'next/server'

import axios from 'axios'
import { buildWebhookContext } from '@/lib/webhook-context'
import { syncGamesFromAlea } from '@coinfrenzy/core/games'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shape of a single game entry returned by the Alea GraphQL API.
interface AleaGame {
  id: string
  name: string
  software?: { id: string | number; name?: string }
  genre?: string
  thumbnailLinks?: Record<string, string>
  assetsLink?: string
  rtp?: number
  volatility?: string
}

function buildGameRecord(game: AleaGame) {
  return {
    externalId: game.id,
    slug: game.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    displayName: game.name,
    providerSlug: game.software?.id?.toString() || 'unknown',
    providerDisplayName: game.software?.name || 'Unknown',
    category: game.genre || 'slots',
    thumbnailUrl: game.thumbnailLinks?.['RATIO_3_4_WEBP'] || null,
    bannerUrl: game.assetsLink || null,
    rtp: game.rtp ? (game.rtp / 100).toString() : null,
    volatility: game.volatility || null,
    availableInGc: true,
    availableInSc: true,
    isFeatured: false,
    isNew: false,
  }
}

export async function GET(): Promise<Response> {
  // Build context for logging
  const { ctx } = buildWebhookContext('alea-games-load')
  const env = process.env.ALEA_ENV === 'production' ? 'gamesReady' : 'gamesAvailable'

  const queryPageDetails = JSON.stringify({
    query: `{
        ${env}(marketCode: "SC", size: 50) {
            page {
            number
            size
            totalPages
            totalElements
            }
        }
        }`,
    variables: {},
  })

  const options = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${process.env.ALEA_API_BASE}/graphql`,
    headers: {
      Authorization: `Bearer ${process.env.ALEA_WEBHOOK_SECRET}`, // Replace with the actual token
      'Alea-CasinoId': process.env.ALEA_CASINO_ID_1,
      'Alea-EnvironmentId': process.env.ALEA_CASINO_ENVIRONMENT_ID_1,
      'Content-Type': 'application/json',
    },
    data: queryPageDetails,
  }

  try {
    // Fetching initial page details
    ctx.logger.info('options::>>>', options)
    const {
      data: { data: pageData },
      status,
    } = await axios(options)
    ctx.logger.info('pageData::>>>', pageData)

    if (status !== 200 || !pageData) {
      return NextResponse.json(
        {
          error: 'Internal server error',
          message: 'Failed to fetch game details',
        },
        { status: 500 },
      )
    }

    const pageDetails =
      env === 'gamesAvailable' ? pageData.gamesAvailable.page : pageData.gamesReady.page
    const totalPages = pageDetails.totalPages

    const data: ReturnType<typeof buildGameRecord>[] = []

    // Fetching game data for all pages
    for (let i = 0; i < totalPages; i++) {
      const queryGames = JSON.stringify({
        query: `{
            ${env}(marketCode: "SC", size: 50, page: ${i}) {
            results {
                id
                name
                software {
                    id
                    name
                }
                type
                status
                genre
                jackpot
                freeSpinsCurrencies
                ratio
                rtp
                volatility
                minBet
                maxBet
                maxExposure
                maxWinMultiplier
                lines
                hitFrequency
                buyFeature
                releaseDate
                features
                assetsLink
                thumbnailLinks
                demoAvailable
            }
            }
        }`,
        variables: {},
      })

      const pageOptions = {
        ...options,
        data: queryGames,
      }

      const {
        data: { data: gamesData },
        status: gameStatus,
      } = await axios(pageOptions)

      if (gameStatus === 200) {
        const results: AleaGame[] =
          env === 'gamesAvailable' ? gamesData.gamesAvailable.results : gamesData.gamesReady.results

        // Transform GraphQL response to match expected sync function format
        const transformedResults = results.map(buildGameRecord)

        data.push(...transformedResults)
      }

      const { ctx } = buildWebhookContext('alea')
      await syncGamesFromAlea(ctx, data)
    }

    return NextResponse.json(
      {
        message: 'Games loaded successfully',
        totalGames: data.length,
      },
      { status: 200 },
    )
  } catch (error) {
    ctx.logger.error('Error loading Alea games:', { error })
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
