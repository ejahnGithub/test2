import * as core from '@actions/core'
import * as github from '@actions/github'
import * as apiClient from './api-client'
import * as tarHelper from './tar-helper'

export async function run(): Promise<void> {
  try {
    const repository: string = process.env.GITHUB_REPOSITORY || ''
    if (repository === '') {
      core.setFailed(`Could not find Repository!`)
      return
    }
    if (github.context.eventName !== 'release') {
      core.setFailed('Please ensure you have the workflow trigger as release.')
      return
    }

    const repoFromContexPayload = github.context.payload.repository

    if (repoFromContexPayload === undefined) {
      core.setFailed(`Could not find Repository in context payload!`)
      return
    }
    if (repoFromContexPayload.full_name !== repository) {
      core.setFailed(
        `Repository in context payload does not match the repository in the environment variable!`
      )
      return
    }

    const forcePubishPrivateRepo: boolean = core.getBooleanInput(
      'force-publish-private-repo'
    )

    if (repoFromContexPayload?.visibility !== 'public') {
      core.info(`Repository is not public.`)
      if (!forcePubishPrivateRepo) {
        core.info(`Please use a public repository for this action.`)
        return
      }
    }

    const path: string = core.getInput('path')
    // create tarball
    const tarBallCreated = await tarHelper.createTarBall(path)
    // create zipfile
    const zipfileCreated = await tarHelper.createZip(path)

    // create oci manifest (layers)
    const releaseId: string = github.context.payload.release.id
    const semver: string = github.context.payload.release.tag_name

    if (tarBallCreated && zipfileCreated) {
      await apiClient.orasLogin(
        core.getInput('username'),
        core.getInput('password')
      )
      await apiClient.publishOciArtifact(repository, releaseId, semver)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
