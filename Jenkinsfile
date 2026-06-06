pipeline {
  agent any

  environment {
    REGISTRY_URL      = 'https://ghcr.io'
    GH_NAMESPACE      = 'ssmani5491'
    GH_OWNER          = 'ssmani5491'
    DOCKER_BUILDKIT   = '1'
    GIT_CRED_ID       = 'github-pat-mani'
    REACT_APP_API_URL = 'http://172.16.6.214:5008/api'
    TRIVY_SEV_MAIN    = 'CRITICAL'
    TRIVY_SEV_DEV     = 'CRITICAL'
    ACTIVE_BRANCH     = 'main'
  }

  options {
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
    skipDefaultCheckout(true)
  }

  triggers {
    // Triggers are managed via Jenkins UI configuration
    // Uncomment to enable:
    // githubPush()           // fires instantly on GitHub webhook push event
    // pollSCM('* * * * *')   // poll every 1 min as reliable fallback
    // For now, use: githubPush() to enable webhook
    githubPush()
  }

  stages {

    /* ---------- 0) Clean workspace + Checkout ---------- */
    stage('Checkout') {
      steps {
        cleanWs()
        checkout scm
        script {
          def rawBranch = env.GIT_BRANCH ?: sh(returnStdout: true, script: 'git rev-parse --abbrev-ref HEAD').trim()
          def normalized = rawBranch.replaceFirst(/^origin[0-9]*\//, '')
          env.ACTIVE_BRANCH = normalized
          echo "Active git branch: ${env.ACTIVE_BRANCH} (raw: ${rawBranch})"
        }
      }
    }

    /* ---------- 1) SonarQube scan (non-blocking) ---------- */
    stage('Sonar Scan') {
      steps {
        script {
          try {
            def scannerHome = tool name: 'sonar-scanner',
                                   type: 'hudson.plugins.sonar.SonarRunnerInstallation'
            def rawRepo = sh(returnStdout: true,
                             script: "basename -s .git \$(git config --get remote.origin.url)").trim()
            def sqKey   = rawRepo.replaceAll('[^A-Za-z0-9:_\\-\\.]', '-')
            withSonarQubeEnv('sonar') {
              sh """
                ${scannerHome}/bin/sonar-scanner \
                  -Dsonar.projectKey=${sqKey} \
                  -Dsonar.projectName=${rawRepo} \
                  -Dsonar.sources=backend,frontend/src \
                  -Dsonar.exclusions=**/node_modules/**,**/build/**,**/dist/**,**/*.min.js,**/*.map,**/.env,**/*.env,**/service-account.json,**/*token*.json,**/*secret*.json \
                  -Dsonar.sourceEncoding=UTF-8 \
                  -Dsonar.scm.provider=git \
                  -Dsonar.scm.forceReloadAll=true
              """
            }
          } catch (Exception e) {
            echo "WARNING: SonarQube unavailable: ${e.getMessage()} — continuing"
            currentBuild.result = 'UNSTABLE'
          }
        }
      }
    }

    /* ---------- 2) Quality Gate (non-blocking) ---------- */
    stage('Quality Gate') {
      steps {
        script {
          try {
            timeout(time: 10, unit: 'MINUTES') {
              def qg = waitForQualityGate abortPipeline: false
              if (qg.status != 'OK') {
                echo "WARNING: Quality Gate status: ${qg.status} — continuing"
                currentBuild.result = 'UNSTABLE'
              }
            }
          } catch (Exception e) {
            echo "WARNING: Quality Gate check failed: ${e.getMessage()} — continuing"
            currentBuild.result = 'UNSTABLE'
          }
        }
      }
    }

    /* ---------- 3) Trivy filesystem scan ---------- */
    stage('Trivy Code Scan') {
      steps {
        script {
          sh 'mkdir -p reports'
          def sev         = env.TRIVY_SEV_MAIN
          def trivyExists = sh(returnStatus: true, script: 'command -v trivy >/dev/null 2>&1') == 0
          def ignoreFlag  = fileExists('.trivyignore') ? '--ignorefile .trivyignore' : ''
          def skipDirs    = '--skip-dirs node_modules --skip-dirs .git --skip-dirs build --skip-dirs dist --skip-dirs reports'

          if (trivyExists) {
            sh """
              trivy fs --no-progress --skip-version-check \
                --severity ${sev} --exit-code 0 \
                --format table ${skipDirs} --scanners vuln ${ignoreFlag} \
                . > reports/trivy-fs-console.txt 2>&1 || true
              cat reports/trivy-fs-console.txt || true
              trivy fs --no-progress --skip-version-check \
                --severity ${sev} --exit-code 0 \
                --format json -o reports/trivy-fs.json \
                ${skipDirs} --scanners vuln ${ignoreFlag} . > /dev/null 2>&1 || true
            """
          } else {
            sh """
              docker run --rm \
                -v ${WORKSPACE}:/workspace aquasec/trivy:latest \
                fs --no-progress --skip-version-check \
                --severity ${sev} --exit-code 0 \
                --format table --skip-dirs node_modules --skip-dirs .git \
                --scanners vuln /workspace \
                > ${WORKSPACE}/reports/trivy-fs-console.txt 2>&1 || true
              cat ${WORKSPACE}/reports/trivy-fs-console.txt || true
            """
          }
          archiveArtifacts artifacts: 'reports/trivy-fs*', allowEmptyArchive: true
        }
      }
    }

    /* ---------- 4) Frontend build (pre-build via Docker for cache) ---------- */
    stage('Frontend Build') {
      options { timeout(time: 35, unit: 'MINUTES') }
      steps {
        sh """
          set -eu
          echo "=== Building React frontend ==="
          docker run --rm \
            --shm-size=2gb \
            -e CI=false \
            -e DISABLE_ESLINT_PLUGIN=true \
            -e GENERATE_SOURCEMAP=false \
            -e NODE_OPTIONS=--max-old-space-size=6144 \
            -e SKIP_PREFLIGHT_CHECK=true \
            -e REACT_APP_API_URL="${REACT_APP_API_URL}" \
            -e NPM_CONFIG_CACHE=/tmp/npm-cache \
            -v "${WORKSPACE}:${WORKSPACE}:rw" \
            -w "${WORKSPACE}/frontend" \
            node:20-slim \
            bash -lc "set -eu; npm install --ignore-scripts --prefer-offline 2>/dev/null || npm install --ignore-scripts; npm run build; test -f build/index.html"
          echo "=== Frontend build complete ==="
        """
      }
    }

    /* ---------- 5) Docker image build ---------- */
    stage('Docker Build') {
      options { timeout(time: 40, unit: 'MINUTES') }
      steps {
        script {
          // Repo name is 'roombooking'
          env.RAW_REPO = 'roombooking'
          def imageRepo = 'roombooking'
          env.IMAGE     = "ghcr.io/${env.GH_NAMESPACE}/${imageRepo}"

          def gitCommit  = env.GIT_COMMIT ?: sh(returnStdout: true, script: 'git rev-parse HEAD').trim()
          env.GIT_COMMIT = gitCommit
          def shortSha   = gitCommit.take(7)
          def buildNo    = env.BUILD_NUMBER
          def latestTag  = sh(returnStdout: true,
                              script: "git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0").trim()
          def parts      = latestTag.replace('v', '').tokenize('.')
          def MAJOR      = (parts.size() > 0 ? parts[0].replaceAll('[^0-9].*', '') : '0') as int
          def MINOR      = (parts.size() > 1 ? parts[1].replaceAll('[^0-9].*', '') : '0') as int
          def PATCH      = (parts.size() > 2 ? parts[2].replaceAll('[^0-9].*', '') : '0') as int

          env.NEXT_VERSION = "v${MAJOR}.${MINOR}.${PATCH + 1}"
          env.RC_VERSION   = "${env.NEXT_VERSION}-rc.${buildNo}"

          def isMain       = (env.ACTIVE_BRANCH == 'main')
          env.TAGS         = isMain
            ? "prod,latest,${env.NEXT_VERSION},${shortSha}"
            : "dev,${env.RC_VERSION},${shortSha}"
          env.PRIMARY_TAG  = env.TAGS.split(',')[0]
          def versionLabel = isMain ? env.NEXT_VERSION : env.RC_VERSION

          echo "Building ${env.IMAGE}:${env.PRIMARY_TAG}"

          sh """
            set -eu
            test -f Dockerfile || { echo "ERROR: Dockerfile not found"; exit 1; }
            docker info >/dev/null 2>&1 || { echo "ERROR: Docker daemon unreachable"; exit 1; }

            ( while true; do
                sleep 10
                echo "[keep-alive] \$(date -u +%H:%M:%SZ) docker build running..."
                touch "\${WORKSPACE}/.heartbeat" 2>/dev/null || true
              done ) &
            KEEP=\$!

            docker build -f Dockerfile \
              --build-arg REACT_APP_API_URL="${REACT_APP_API_URL}" \
              -t ${env.IMAGE}:${env.PRIMARY_TAG} \
              --progress=plain \
              --label ci.branch=${env.ACTIVE_BRANCH} \
              --label ci.sha=${env.GIT_COMMIT} \
              --label ci.build=${buildNo} \
              --label ci.repo=${env.RAW_REPO} \
              --label ci.version=${versionLabel} \
              .
            EXIT=\$?
            kill \$KEEP 2>/dev/null || true
            exit \$EXIT
          """

          for (t in env.TAGS.split(',')) {
            def tag = t.trim()
            if (tag && tag != env.PRIMARY_TAG) {
              sh "docker tag ${env.IMAGE}:${env.PRIMARY_TAG} ${env.IMAGE}:${tag}"
            }
          }
        }
      }
    }

    /* ---------- 6) Trivy image scan ---------- */
    stage('Trivy Image Scan') {
      steps {
        script {
          sh 'mkdir -p reports'
          def trivyExists = sh(returnStatus: true, script: 'command -v trivy >/dev/null 2>&1') == 0
          def ignoreFlag  = fileExists('.trivyignore') ? '--ignorefile .trivyignore' : ''

          if (trivyExists) {
            sh """
              trivy image --no-progress --skip-version-check \
                --severity CRITICAL,HIGH --exit-code 0 \
                --format table ${ignoreFlag} \
                ${env.IMAGE}:${env.PRIMARY_TAG} \
                > reports/trivy-image-summary.txt 2>&1 || true
              cat reports/trivy-image-summary.txt || true
              trivy image --no-progress --skip-version-check \
                --severity CRITICAL --exit-code 0 \
                --format json -o reports/trivy-image.json ${ignoreFlag} \
                ${env.IMAGE}:${env.PRIMARY_TAG} > /dev/null 2>&1 || true
            """
          } else {
            sh """
              docker run --rm \
                -v /var/run/docker.sock:/var/run/docker.sock \
                aquasec/trivy:latest image --no-progress --skip-version-check \
                --severity CRITICAL,HIGH --exit-code 0 --format table \
                ${env.IMAGE}:${env.PRIMARY_TAG} \
                > ${WORKSPACE}/reports/trivy-image-summary.txt 2>&1 || true
              cat ${WORKSPACE}/reports/trivy-image-summary.txt || true
            """
          }
          archiveArtifacts artifacts: 'reports/*', allowEmptyArchive: true
        }
      }
    }

    /* ---------- 7) Push to GHCR ---------- */
    stage('Push') {
      steps {
        script {
          withCredentials([usernamePassword(
            credentialsId: env.GIT_CRED_ID,
            usernameVariable: 'GH_USER',
            passwordVariable: 'GH_PAT'
          )]) {
            sh """
              echo "\${GH_PAT}" | docker login ghcr.io -u "${env.GH_OWNER}" --password-stdin
            """

            def failedTags = []
            for (t in env.TAGS.split(',')) {
              def tag = t.trim()
              if (!tag) continue
              def ref    = "${env.IMAGE}:${tag}"
              def exists = sh(returnStatus: true, script: "docker image inspect ${ref} >/dev/null 2>&1") == 0
              if (!exists) { echo "WARNING: ${ref} not found locally, skipping"; continue }
              def rc = sh(returnStatus: true, script: "docker push ${ref}")
              if (rc == 0) {
                echo "Pushed ${ref}"
              } else {
                echo "ERROR: Failed to push ${ref}"
                failedTags.add(ref)
              }
            }

            if (failedTags.size() > 0) {
              error "Failed to push: ${failedTags.join(', ')}"
            }

            // Create git release tag on main
            if (env.ACTIVE_BRANCH == 'main') {
              try {
                sh """
                  git config user.email "ci@jenkins"
                  git config user.name  "Jenkins CI"
                  if git tag -l | grep -q "^${env.NEXT_VERSION}\$"; then
                    git tag -d ${env.NEXT_VERSION}
                  fi
                  if git ls-remote --tags https://${env.GH_OWNER}:\${GH_PAT}@github.com/${env.GH_OWNER}/roombooking.git | grep -q "refs/tags/${env.NEXT_VERSION}\$"; then
                    echo "Tag ${env.NEXT_VERSION} already on remote, skipping"
                  else
                    git tag -a ${env.NEXT_VERSION} -m "Release ${env.NEXT_VERSION}"
                    git push https://${env.GH_OWNER}:\${GH_PAT}@github.com/${env.GH_OWNER}/roombooking.git ${env.NEXT_VERSION}
                    echo "Tagged ${env.NEXT_VERSION}"
                  fi
                """
              } catch (Exception e) {
                echo "WARNING: Git tag failed: ${e.getMessage()} — continuing"
              }
            }
          }
        }
      }
    }

    /* ---------- 8) Cleanup ---------- */
    stage('Cleanup') {
      steps {
        script {
          if (env.IMAGE && env.TAGS) {
            for (t in env.TAGS.split(',')) {
              sh "docker rmi ${env.IMAGE}:${t.trim()} 2>/dev/null || true"
            }
          }
          sh 'docker image prune -f || true'
          sh 'docker builder prune -f || true'
        }
      }
    }
  }

  post {
    always {
      node(null) {
        sh 'docker logout ghcr.io 2>/dev/null || true'
        sh 'docker image prune -f 2>/dev/null || true'
      }
    }
    success  { echo "Pipeline SUCCESS — image pushed to ghcr.io/ssmani5491/roombooking" }
    unstable { echo "Pipeline UNSTABLE — check SonarQube/Trivy warnings" }
    failure  { echo "Pipeline FAILED — check logs above" }
  }
}
