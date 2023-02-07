import * as core from '@actions/core'
import * as fs from 'fs'
import {sigstore} from 'sigstore'

const signOptions = {
  // oidcClientID: ?, //'sigstore',
  // oidcIssuer: ?, //'https://oauth2.sigstore.dev/auth',
  // rekorBaseURL: ,//sigstore.DEFAULT_REKOR_BASE_URL,
  // fulcioBaseURL: ,
}

//returns the API Base Url
export function getApiBaseUrl(): string {
  return process.env.GITHUB_API_URL || 'https://api.github.com'
}

// Publish the Action Artifact to GHCR by calling the post API
export async function publishOciArtifact(
  repository: string,
  releaseId: string,
  semver: string
): Promise<void> {
  try {
    const TOKEN: string = core.getInput('token')
    core.setSecret(TOKEN)
    // const path: string = core.getInput('path')
    // const publishPackageEndpoint = `${getApiBaseUrl()}/repos/${repository}/actions/package`

    const tempDir = '/tmp'

    const buffer = fs.readFileSync(`${tempDir}/archive.tar.gz`)

    // Sign the package and get attestations
    const attestations = await sigstore.sign(buffer)

    // write the attestations to a file
    fs.writeFileSync(`${tempDir}/bundle.sigstore`, JSON.stringify(attestations))
    core.info(`Created attestations from GHCR package for semver(${semver})`)
    // verify the package
    try {
      // reload the package
      const reloadedBuffer = fs.readFileSync(`${tempDir}/archive.tar.gz`)

      await sigstore.verify(attestations, reloadedBuffer)

      core.info(`Verified the package for semver(${semver})`)
    } catch (error) {
      core.info(`Failed to verify the package with error: ${error}`)
    }

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

// export async function getRepositoryMetadata():
