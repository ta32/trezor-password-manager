var gulp = require('gulp'),
  sass = require('gulp-sass')(require('sass')),
  connect = require('gulp-connect'),
  terser = require('gulp-terser'),
  cleanCSS = require('gulp-clean-css'),
  sourcemaps = require('gulp-sourcemaps'),
  babelify = require('babelify'),
  source = require('vinyl-source-stream'),
  buffer = require('vinyl-buffer'),
  browserify = require('browserify');

// Babelify options for app (React)
var babelifyAppOpts = {
  presets: ['@babel/preset-env', '@babel/preset-react'],
  global: true,
  ignore: [/\/node_modules\/(?!@trezor\/connect-web)/]
};

// Babelify options for background (plain JS)
var babelifyBgOpts = {
  presets: ['@babel/preset-env'],
  global: true,
  ignore: [/\/node_modules\/(?!@trezor\/connect-web)/]
};

// Compile SCSS with sourcemaps
gulp.task('sass', function(cb) {
  gulp
    .src('./source/app/*.scss')
    .pipe(sourcemaps.init())
    .pipe(sass().on('error', sass.logError))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./extension/dist/'));
  cb();
});

// Production CSS
gulp.task('production-sass', () => {
  return gulp
    .src('./source/app/*.scss')
    .pipe(sass())
    .pipe(cleanCSS())
    .pipe(gulp.dest('./extension/dist/'));
});

// Production build: app.js
gulp.task('production-app', () => {
  console.log('This process will take several minutes, feel free to have a coffee.');
  return browserify({
    entries: ['./source/app/app.js'],
    debug: false
  })
    .transform(babelify, babelifyAppOpts)
    .bundle()
    .pipe(source('app.js'))
    .pipe(buffer())
    .pipe(
      terser({
        mangle: false,
        ecma: 5
      })
    )
    .pipe(gulp.dest('./extension/dist/'));
});

// Production build: background.js
gulp.task('production-bg', () => {
  return browserify({
    entries: ['./source/background/background.js'],
    debug: false
  })
    .transform(babelify, babelifyBgOpts)
    .bundle()
    .pipe(source('background.js'))
    .pipe(buffer())
    .pipe(
      terser({
        mangle: false,
        ecma: 5
      })
    )
    .pipe(gulp.dest('./extension/js'));
});

// Dev build: app.js
gulp.task('dev-app', () => {
  return browserify({
    entries: ['./source/app/app.js'],
    debug: true
  })
    .transform(babelify, babelifyAppOpts)
    .bundle()
    .on('error', err => console.error(err.message))
    .pipe(source('app.js'))
    .pipe(gulp.dest('./extension/dist/'))
    .pipe(connect.reload());
});

// Dev build: background.js
gulp.task('dev-bg', () => {
  return browserify({
    entries: ['./source/background/background.js'],
    debug: true
  })
    .transform(babelify, babelifyBgOpts)
    .bundle()
    .on('error', err => console.error(err.message))
    .pipe(source('background.js'))
    .pipe(gulp.dest('./extension/js'))
    .pipe(connect.reload());
});

// Local server with live reload
gulp.task('connect', () => {
  connect.server({
    root: 'app',
    port: 3014,
    livereload: true
  });
});

// Reload HTML on changes
gulp.task('html', () => {
  return gulp.src('./extension/*.html').pipe(connect.reload());
});

// Watch for changes
gulp.task('watch', () => {
  gulp.watch('./source/background/**/*.js', gulp.series('dev-bg'));
  gulp.watch('./source/app/index.html', gulp.series('html'));
  gulp.watch('./source/app/**/*.scss', gulp.series('sass'));
  gulp.watch('./source/app/**/*.js', gulp.series('dev-app'));
});

// Composite tasks
gulp.task('default', gulp.series('production-app', 'production-bg', 'sass'));
gulp.task('serve', gulp.series('dev-bg', 'dev-app', 'sass', 'connect', 'watch'));
gulp.task('production', gulp.series('production-app', 'production-bg', 'production-sass'));
