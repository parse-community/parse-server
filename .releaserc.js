/**
 * Semantic Release Config
 */

const { readFile } = require('fs').promises;
const { resolve } = require('path');

// For ES6 modules use:
// import { readFile } from 'fs/promises';
// import { resolve, dirname } from 'path';
// import { fileURLToPath } from 'url';

// Get env vars
const ref = process.env.GITHUB_REF;
const serverUrl = process.env.GITHUB_SERVER_URL;
const repository = process.env.GITHUB_REPOSITORY;
const repositoryUrl = serverUrl + '/' + repository;

// Declare params
const resourcePath = './.releaserc/';
const templates = {
  main: { file: 'template.hbs', text: undefined },
  header: { file: 'header.hbs', text: undefined },
  commit: { file: 'commit.hbs', text: undefined },
  footer: { file: 'footer.hbs', text: undefined },
};

// Declare semantic config
async function config() {

  // Get branch
  const branch = ref?.split('/')?.pop()?.split('-')[0] || '(current branch could not be determined)';
  console.log(`Running on branch: ${branch}`);

  // Set changelog file
  const changelogFile = `./changelogs/CHANGELOG_${branch}.md`;
  console.log(`Changelog file output to: ${changelogFile}`);

  // Load template file contents
  await loadTemplates();

  const config = {
    branches: [
      'release',
      { name: 'alpha', prerelease: true },
      { name: 'beta', prerelease: true },
      'next-major',
      // Long-Term-Support branch of previous major version
      'release-6.x.x',
    ],
    dryRun: false,
    debug: true,
    ci: true,
    tagFormat: '${version}',
    plugins: [
      ['@semantic-release/commit-analyzer', {
        preset: 'angular',
        releaseRules: [
          { type: 'docs', scope: 'README', release: 'patch' },
          { scope: 'no-release', release: false },
        ],
        parserOpts: {
          noteKeywords: [ 'BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING' ],
        },
      }],
      ['@semantic-release/release-notes-generator', {
        preset: 'angular',
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        },
        writerOpts: {
          commitsSort: ['subject', 'scope'],
          mainTemplate: templates.main.text,
          headerPartial: templates.header.text,
          commitPartial: templates.commit.text,
          footerPartial: templates.footer.text,
        },
      }],
      ['@semantic-release/changelog', {
        'changelogFile': changelogFile,
      }],
      ['@semantic-release/npm', {
        'npmPublish': true,
      }],
      ['@semantic-release/git', {
        assets: [changelogFile, 'package.json', 'package-lock.json', 'npm-shrinkwrap.json'],
      }],
      ['@semantic-release/github', {
        successComment: getReleaseComment(),
        labels: ['type:ci'],
        releasedLabels: ['state:released<%= nextRelease.channel ? `-\${nextRelease.channel}` : "" %>']
      }],
      // Back-merge module runs last because if it fails it should not impede the release process
      [
        "@saithodev/semantic-release-backmerge",
        {
          "backmergeBranches": [
            { from: "beta", to: "alpha" },
            { from: "release", to: "beta" },
          ]
        }
      ],
    ],
  };

  return config;
}

async function loadTemplates() {
  for (const template of Object.keys(templates)) {
    
    // For ES6 modules use:
    // const fileUrl = import.meta.url;
    // const __dirname = dirname(fileURLToPath(fileUrl));

    const filePath = resolve(__dirname, resourcePath, templates[template].file);
    const text = await readFile(filePath, 'utf-8');
    templates[template].text = text;
  }
}

function getReleaseComment() {
  const url = repositoryUrl + '/releases/tag/${nextRelease.gitTag}';
  const comment = '🎉 This change has been released in version [${nextRelease.version}](' + url + ')';
  return comment;
}

module.exports = config();
