import gulp from 'gulp'
import gulpLoadPlugins from 'gulp-load-plugins'
import path from 'path'
import del from 'del'

const plugins = gulpLoadPlugins()

const paths = {
  js: ['./**/*.js', '!dist/**', '!node_modules/**', '!coverage/**'],
  nonJs: ['./package.json', './.gitignore', './.env', './swagger.yaml', './appversion.json']
}

// Clean up dist and coverage directory
gulp.task('clean', (done) => {
  del.sync(['dist/**', 'coverage/**', '!dist', '!coverage'])
  done()
})

// Copy all files to dist (no compilation needed with Node.js 22.x)
gulp.task('copy', (done) => {
  const stream = gulp.src([...paths.js, ...paths.nonJs], { base: '.' })
    .pipe(gulp.dest('dist'))

  stream.on('end', () => {
    done()
  })
  stream.on('error', (err) => {
    done(err)
  })
})

// default task: clean dist and copy files (no compilation needed)
gulp.task('default', gulp.series('clean', 'copy', (done) => {
  done()
}))
