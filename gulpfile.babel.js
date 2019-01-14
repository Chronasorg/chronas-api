import gulp from 'gulp'
import gulpLoadPlugins from 'gulp-load-plugins'
import path from 'path'
import del from 'del'
import minimist from 'minimist'
import zip from 'gulp-zip'
import fs from 'fs'

const plugins = gulpLoadPlugins()

const paths = {
  js: ['./**/*.js', '!dist/**', '!scripts/**', '!node_modules/**', '!coverage/**'],
  nonJs: ['./package.json', './.gitignore', './.env', './swagger.yaml', './appversion.json'],
  tests: './server/tests/*.js'
}

const knownOptions = {
  string: 'packagePath',
  default: { packageName: 'Package.zip', packagePath: path.join(__dirname, '_package') }
}

const options = minimist(process.argv.slice(2), knownOptions)

// Clean up dist and coverage directory
gulp.task('clean', (done) => {
  del.sync(['dist/**', 'dist/.*', 'coverage/**', '!dist', '!coverage'])
  done()
}
)

// Copy non-js files to dist
gulp.task('copy', (done) => {
  const stream = gulp.src(paths.nonJs, { allowEmpty: true })
    .pipe(plugins.newer('dist'))
    .pipe(gulp.dest('dist'))

  stream.on('end', () => {
    // run some code here
    done()
  })
  stream.on('error', (err) => {
    done(err)
  })
}
)

gulp.task('package', (done) => {
  const packagePaths = ['dist/**',
    '!**/_package/**',
    '!**/typings/**',
    '!typings',
    '!_package',
    '!gulpfile.js']

  // add exclusion patterns for all dev dependencies
  const packageJSON = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
  const devDeps = packageJSON.devDependencies

  for (let i = 0; i < devDeps.length; i++) {
    const excludePattern0 = '!**/scripts/*'
    const excludePattern1 = `!**/node_modules/${devDeps[i]}/**`
    const excludePattern2 = `!**/node_modules/${devDeps[i]}`
    packagePaths.push(excludePattern0)
    packagePaths.push(excludePattern1)
    packagePaths.push(excludePattern2)
  }

  const stream = gulp.src(packagePaths)
    .pipe(zip(options.packageName))
    .pipe(gulp.dest(options.packagePath))

  stream.on('end', () => {
    // run some code here
    done()
  })
  stream.on('error', (err) => {
    done(err)
  })
})

// Compile ES6 to ES5 and copy to dist
gulp.task('babel', (done) => {
  const stream = gulp.src([...paths.js, '!gulpfile.babel.js'], { base: '.' })
      .pipe(plugins.newer('dist'))
      .pipe(plugins.sourcemaps.init())
      .pipe(plugins.babel())
      .pipe(plugins.sourcemaps.write('.', {
        includeContent: false,
        sourceRoot(file) {
          return path.relative(file.path, __dirname)
        }
      }))
      .pipe(gulp.dest('dist'))

  stream.on('end', () => {
    // run some code here
    done()
  })
  stream.on('error', (err) => {
    done(err)
  })
}
)

// Start server with restart on file changes
gulp.task('nodemon', gulp.series('copy', 'babel', (done) => {
  plugins.nodemon({
    script: path.join('dist', 'index.js'),
    ext: 'js',
    ignore: ['node_modules/**/*.js', 'scripts/*', 'dist/**/*.js'],
    tasks: ['copy', 'babel']
  })
  done()
}
))

// gulp serve for development
gulp.task('serve', gulp.series('clean', 'nodemon', (done) => {
  done()
}))


// default task: clean dist, compile js files and copy non-js files.
gulp.task('default', gulp.series('clean', 'copy', 'babel', (done) => {
  done()
}))
