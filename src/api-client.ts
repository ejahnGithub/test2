import * as core from '@actions/core'
import * as exec from '@actions/exec'
import crypto from 'crypto'
import * as fs from 'fs'
import {sigstore} from 'sigstore'

const tempDir = '/tmp'

//returns the API Base Url
export function getApiBaseUrl(): string {
  return process.env.GITHUB_API_URL || 'https://api.github.com'
}

// Publish the Action Artifact to GHCR by calling the post API
export async function publishOciArtifact(
  repository: string,
  releaseId: string,
  semver: string,
  githubSHA: string
): Promise<void> {
  try {
    const TOKEN: string = core.getInput('token')
    core.setSecret(TOKEN)

    const ociManifestPath = await orasPushArtifacts(
      repository,
      semver,
      githubSHA
    )

    // sign the oci manifest
    const ociManifestBuffer = fs.readFileSync(ociManifestPath)
    const attestations = await sigstore.sign(ociManifestBuffer)
    fs.writeFileSync(`${tempDir}/bundle.sigstore`, JSON.stringify(attestations))
    core.info(`Created attestations from GHCR package for semver(${semver})`)

    // TODO: push x y z to the dotcom

    // const path: string = core.getInput('path')
    // const publishPackageEndpoint = `${getApiBaseUrl()}/repos/${repository}/actions/package`

    // Sign the package and get attestations
    // const attestations = await sigstore.sign(buffer)

    // // write the attestations to a file
    // fs.writeFileSync(`${tempDir}/bundle.sigstore`, JSON.stringify(attestations))
    // core.info(`Created attestations from GHCR package for semver(${semver})`)
    // // verify the package

    // const fileStream = fs.createReadStream(`${tempDir}/archive.tar.gz`)

    // const response = await axios.post(publishPackageEndpoint, fileStream, {
    //   headers: {
    //     Accept: 'application/vnd.github.v3+json',
    //     Authorization: `Bearer ${TOKEN}`,
    //     'Content-type': 'application/octet-stream'
    //   },
    //   params: {
    //     release_id: releaseId
    //   }
    // })

    // core.info(
    //   `Created GHCR package for semver(${semver}) with package URL ${response.data.package_url}`
    // )
  } catch (error) {
    errorResponseHandling(error, semver)
  }
}

// Respond with the appropriate error message based on response
function errorResponseHandling(error: any, semver: string): void {
  if (error.response) {
    let errorMessage = `Failed to create package (status: ${error.response.status}) with semver ${semver}. `
    switch (error.response.status) {
      case 400:
      case 404: {
        errorMessage += `Something went wrong. `
        break
      }
      case 401:
      case 403: {
        errorMessage += `Ensure GITHUB_TOKEN has permission "packages: write". `
        break
      }
      default: {
        errorMessage += `Server error, is githubstatus.com reporting a GHCR outage? Please re-run the release at a later time. `
        break
      }
    }
    if (error.response.data.message) {
      errorMessage += `\nResponded with: "${error.response.data.message}"`
    }
    core.setFailed(errorMessage)
  } else if (error.request) {
    core.setFailed(error.request)
  } else {
    core.setFailed(
      `An unexpected error occured with error:\n${JSON.stringify(error)}`
    )
  }
}

export async function orasLogin(
  username: string,
  password: string
): Promise<void> {
  const orasLoginCmd = `oras login -u ${username} -p ${password} ghcr.io`
  await exec.exec(orasLoginCmd)
  core.info(`Logged into GHCR.`)
}

// Push the artifacts to GHCR using ORAS
async function orasPushArtifacts(
  repository: string,
  semver: string,
  githubSHA: string
): Promise<string> {
  const tarballPath = `${tempDir}/archive.tar.gz`
  const zipfilePath = `${tempDir}/archive.zip`

  const tarballBuffer = fs.readFileSync(tarballPath)
  const zipfileBuffer = fs.readFileSync(zipfilePath)

  const mediaType = 'application/vnd.github.actions.package.config.v1+json'
  const tarMediaType =
    'application/vnd.github.actions.package.layer.v1.tar+gzip'
  const zipMediaType = 'application/vnd.github.actions.package.layer.v1.zip'
  const configJSONPath = 'orasConfig/config.txt'
  const ghcrRepo = `ghcr.io/${repository}:${semver}`.toLowerCase()
  const exportedManifestPath = `${tempDir}/exported-manifest.json`
  const annotationJSONPath = createAnnotationFile(
    tarballBuffer,
    zipfileBuffer,
    githubSHA
  )

  const ociPushCmd = `oras push --annotation-file ${annotationJSONPath} --config ${configJSONPath}:${mediaType} ${ghcrRepo} ${tarballPath}:${tarMediaType} ${zipfilePath}:${zipMediaType} --export-manifest ${exportedManifestPath}`
  await exec.exec(ociPushCmd)

  return exportedManifestPath
}

// Create the annotation file for the ORAS push
function createAnnotationFile(
  tarballBuffer: Buffer,
  zipfileBuffer: Buffer,
  githubSHA: string
): string {
  // create annotation for the manifest
  // sha256 digest of each layer
  const digest = crypto.createHash('sha256').update(tarballBuffer).digest('hex')
  const zipfileDigest = crypto
    .createHash('sha256')
    .update(zipfileBuffer)
    .digest('hex')

  // add digest into annotation
  const annotation = {
    $manifest: {
      'com.github.package.type': 'actions_oci_pkg',
      'org.opencontainers.image.sourcecommit': githubSHA,
      'org.opencontainers.image.contentpath': '/',
      'action.tar.gz.digest': `sha256:${digest}`,
      'action.zip.digest': `sha256:${zipfileDigest}`
    }
  }
  // write the annotation to a json file
  const annotationJSONPath = `${tempDir}/annotation.json`
  fs.writeFileSync(annotationJSONPath, JSON.stringify(annotation))
  return annotationJSONPath
}
