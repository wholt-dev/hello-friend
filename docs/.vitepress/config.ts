import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'LitDEX Docs',
  description: 'Official documentation for LitDEX — the LitVM DEX, Hub, points, NFTs, messenger and games.',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['meta', { name: 'theme-color', content: '#000000' }],
    ['meta', { property: 'og:title', content: 'LitDEX Docs' }],
    ['meta', { property: 'og:description', content: 'Official documentation for LitDEX.' }],
    ['meta', { property: 'og:image', content: 'https://docs.litdex.test-hub.xyz/og.png' }],
    ['meta', { property: 'og:url', content: 'https://docs.litdex.test-hub.xyz' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'LitDEX Docs',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'App', link: 'https://litdex.test-hub.xyz' },
      {
        text: 'Community',
        items: [
          { text: 'X (Twitter)', link: 'https://x.com/LitDeXApp' },
          { text: 'Telegram Group', link: 'https://t.me/litdex_discussion' },
          { text: 'Telegram Channel', link: 'https://t.me/litdex_app' },
        ],
      },
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          collapsed: false,
          items: [
            { text: 'What is LitDEX', link: '/' },
            { text: 'Getting Started', link: '/getting-started/' },
            { text: 'Connect a Wallet', link: '/getting-started/wallet' },
            { text: 'Claim Faucet', link: '/getting-started/faucet' },
            { text: 'Register a .lit Name', link: '/getting-started/lit-name' },
          ],
        },
        {
          text: 'Trading',
          collapsed: false,
          items: [
            { text: 'Swap', link: '/swap/' },
            { text: 'Cross-Chain Bridge', link: '/swap/bridge' },
          ],
        },
        {
          text: 'Liquidity',
          collapsed: false,
          items: [
            { text: 'Pool Overview', link: '/pool/' },
            { text: 'Add Liquidity', link: '/pool/add' },
            { text: 'Remove Liquidity', link: '/pool/remove' },
          ],
        },
        {
          text: 'Deploy',
          collapsed: false,
          items: [
            { text: 'Deploy Overview', link: '/deploy/' },
            { text: 'Deploy a Token', link: '/deploy/token' },
            { text: 'Deploy an NFT Collection', link: '/deploy/nft' },
            { text: 'Deploy Staking', link: '/deploy/staking' },
            { text: 'Deploy Vesting', link: '/deploy/vesting' },
          ],
        },
        {
          text: 'Hub',
          collapsed: false,
          items: [
            { text: 'Hub Overview', link: '/hub/' },
            { text: 'Private Chat', link: '/hub/private' },
            { text: 'Global Feed', link: '/hub/global' },
            { text: '.lit Market', link: '/hub/market' },
            { text: '.lit Domain Registration', link: '/hub/lit-domain' },
            { text: 'Profile', link: '/hub/profile' },
          ],
        },
        {
          text: 'Points System',
          collapsed: false,
          items: [
            { text: 'How Points Work', link: '/points/' },
            { text: 'Daily Check-in', link: '/points/check-in' },
            { text: 'Daily Caps', link: '/points/caps' },
            { text: 'Leaderboard', link: '/points/leaderboard' },
          ],
        },
        {
          text: 'NFTs',
          collapsed: false,
          items: [
            { text: 'NFT Overview', link: '/nfts/' },
            { text: 'Tiers & Rewards', link: '/nfts/tiers' },
            { text: 'Mint & Claim', link: '/nfts/mint-claim' },
          ],
        },
        {
          text: 'Messenger',
          collapsed: false,
          items: [
            { text: 'Messenger Overview', link: '/messenger/' },
            { text: 'On-chain Public + Direct', link: '/messenger/on-chain' },
          ],
        },
        {
          text: 'Socials & Quests',
          collapsed: false,
          items: [
            { text: 'Socials Overview', link: '/socials/' },
          ],
        },
        {
          text: 'Games',
          collapsed: false,
          items: [
            { text: 'Games Overview', link: '/games/' },
            { text: 'Math Slash', link: '/games/math-slash' },
          ],
        },
        {
          text: 'Faucet',
          collapsed: false,
          items: [
            { text: 'Faucet Overview', link: '/faucet/' },
          ],
        },
        {
          text: 'Reference',
          collapsed: true,
          items: [
            { text: 'FAQ', link: '/faq' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Contracts', link: '/reference/contracts' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'x', link: 'https://x.com/LitDeXApp' },
      { icon: 'github', link: 'https://github.com/0xDarkSeidBull/litdex' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 LitDEX',
    },

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    editLink: {
      pattern: 'https://github.com/0xDarkSeidBull/litdex-docs/edit/main/:path',
      text: 'Edit this page on GitHub',
    },

    outline: {
      level: [2, 3],
      label: 'On this page',
    },
  },
});
