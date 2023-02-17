import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'

// Creates a zip of the inputs specified in path input or the entire contents
export async function createZip(path: string): Promise<boolean> {
  const tempDir = '/tmp'
  const repoNwo: string = process.env.GITHUB_REPOSITORY || ''
  const repoParse = repoNwo.split('/')
  const repoName: string = repoParse[1]
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir)
    }

    const pathArray: string[] = path.trim().split(/\s+/)
    if (!isValidPath(pathArray)) {
      throw new Error(
        'Invalid path. Please ensure the path input has a valid path defined and separated by a space if you want multiple files/folders to be packaged.'
      )
    }

    if (!fs.existsSync(`${tempDir}/${repoName}`)) {
      fs.mkdirSync(`${tempDir}/${repoName}`)
    }

    for await (const filePath of pathArray) {
      await exec.exec(`cp -r ${filePath} ${tempDir}/${repoName}`)
    }

    if (!isActionYamlPresentInPathSrc(pathArray)) {
      await copyActionFile(repoName)
    }

    const cmd = `zip -r ${tempDir}/archive.zip  ${tempDir}/${repoName}`

    await exec.exec(cmd)
    core.info(`Zipfile created.`)

    return true
  } catch (error) {
    let errorMessage = `Creation of zipfile failed! `
    if (error instanceof Error && error.message)
      errorMessage += `${error.message}`
    core.setFailed(errorMessage)
    return false
  } finally {
    if (fs.existsSync(`${tempDir}/${repoName}`)) {
      await exec.exec(`rm -rf ${tempDir}/${repoName}`)
    }
  }
}

// Creates a tar.gzip of the inputs specified in path input or the entire contents
export async function createTarBall(path: string): Promise<boolean> {
  const tempDir = '/tmp'
  const repoNwo: string = process.env.GITHUB_REPOSITORY || ''
  const repoParse = repoNwo.split('/')
  const repoName: string = repoParse[1]
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir)
    }

    const pathArray: string[] = path.trim().split(/\s+/)
    if (!isValidPath(pathArray)) {
      throw new Error(
        'Invalid path. Please ensure the path input has a valid path defined and separated by a space if you want multiple files/folders to be packaged.'
      )
    }

    if (!fs.existsSync(`${tempDir}/${repoName}`)) {
      fs.mkdirSync(`${tempDir}/${repoName}`)
    }

    for await (const filePath of pathArray) {
      await exec.exec(`cp -r ${filePath} ${tempDir}/${repoName}`)
    }

    if (!isActionYamlPresentInPathSrc(pathArray)) {
      await copyActionFile(repoName)
    }

    const cmd = `tar -czf ${tempDir}/archive.tar.gz -C ${tempDir} ${repoName}`

    await exec.exec(cmd)
    core.info(`Tar ball created.`)

    return true
  } catch (error) {
    let errorMessage = `Creation of tarball failed! `
    if (error instanceof Error && error.message)
      errorMessage += `${error.message}`
    core.setFailed(errorMessage)
    return false
  } finally {
    if (fs.existsSync(`${tempDir}/${repoName}`)) {
      await exec.exec(`rm -rf ${tempDir}/${repoName}`)
    }
  }
}

// Boolean function that returns whether the path given in path input is valid or not
export function isValidPath(pathArray: string[]): boolean {
  // Returns true only if every path is a valid path
  return pathArray.every(filePath => {
    return fs.existsSync(filePath)
  })
}

// Boolean function that determines whether action.y(a)ml is present in the path input or not
export function isActionYamlPresentInPathSrc(pathArray: string[]): boolean {
  if (pathArray.includes('action.yml') || pathArray.includes('action.yaml'))
    return true

  // Transform the paths array to remove the traling '/' if it is present in the path input
  pathArray = pathArray.map(e => {
    if (e.endsWith('/')) return e.slice(0, -1)
    return e
  })

  // Returns true as soon as action.y(a)ml is found in any of the paths in the provided path input
  return pathArray.some(filePath => {
    return (
      fs.existsSync(`${filePath}/action.yml`) ||
      fs.existsSync(`${filePath}/action.yaml`)
    )
  })
}

export async function copyActionFile(repoName: string): Promise<void> {
  let actionFileWithExtension = ' '
  const tempDir = '/tmp'
  if (fs.existsSync('action.yml')) {
    actionFileWithExtension = 'action.yml'
  } else if (fs.existsSync('action.yaml')) {
    actionFileWithExtension = 'action.yaml'
  }

  if (actionFileWithExtension === ' ') {
    throw new Error(
      `action.y(a)ml not found. Release packages can be created only for action repositories.`
    )
  } else if (
    fs.existsSync(`${tempDir}/${repoName}/${actionFileWithExtension}`)
  ) {
    core.debug(`action.y(a)ml file already exists in ${tempDir}/${repoName}.`)
  } else {
    await exec.exec(`cp ${actionFileWithExtension} ${tempDir}/${repoName}`)
  }
}
