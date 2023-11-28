/**
 * 
 * In order for this module to run as intended ffmpeg will need to be install on your machine.
 * https://ffmpeg.org/
 * 
 * Image conversion is handled by the npm package Sharp, which supports reading JPEG, PNG, 
 * WebP, GIF, AVIF, TIFF and SVG images. Output images can be in JPEG, PNG, WebP, GIF, 
 * AVIF and TIFF formats.
 * https://sharp.pixelplumbing.com/
 * 
 */

import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';

/**
 * @typedef {Object} ImgFile
 * @property {string} path - Path to the image on the server
 * @property {number} height - The image height
 * @property {number} width - The image width
 * @property {string} format - The image file format, following spec set by Sharp
 */

/**
 * Converts inbound img file objects to {ImgFile}. This allows for any img file interface
 * to be passed to the module via the {unmappedImgFiles} array, only the 'path' prop is required
 * @param {Object[]} unmappedImgFiles
 * @param {string} unmappedImgFiles[].path
 * @returns {Promise<ImgFile[] | Error>}
 */
const mapToInterface = unmappedImgFiles => Promise.all(unmappedImgFiles.map(file => {
  const { path } = file;
  return sharp(path)
    .metadata()
    .then(metadata => ({
      path,
      height: metadata.height,
      width: metadata.width,
      format: metadata.format,
    }))
    .catch(err => {
      throw new Error(`Error getting image metadata from Sharp: ${err}`);
    })
}));

/**
 * Get the path to the dir holding the images
 * @param {string} path 
 * @returns {string}
 */
const getImgDir = path => {
  const endOfDirPathIdx = path.lastIndexOf('/');
  return path.substr(0, endOfDirPathIdx);
};

/**
 * Uses the format property assigned by Sharp
 * @param {ImgFile} img 
 * @returns {boolean}
 */
const isJpeg = img => img.format === 'JPEG';

/**
 * Converting all images to JPEG seems to be faster than processing different file types at once
 * We're using Sharp to do so b/c it's faster & supports far more image file formats than ffmpeg
 * @param {string} imgPath 
 * @param {string} imgDir 
 * @param {string} filename 
 * @returns {Promise<undefined | Error>}
 */
const convertFileToJpegAndRename = (imgPath, imgDir, filename) => sharp(imgPath)
  .toFile(`${imgDir}/${filename}.jpg`)
  .catch(err => {
    throw new Error(`Error converting image to jpeg: ${err}`);
  });

/**
 * Rename jpeg to index ffmpeg will iterate over
 * @param {string} imgPath
 * @param {string} imgDir 
 * @param {string} filename 
 * @return {undefined}
 */
const renameJpeg = (imgPath, imgDir, filename) => {
  fs.renameSync(imgPath, `${imgDir}/${filename}.jpg`);
}

/**
 * The idea here is to set all images to the same width x height and avoid stretching images 
 * through the use of padding. We find the image with the smallest width (scaleW), which is the width we'll set all images to.
 * We then find the image with the largest height based on the new scaled width, and set the padding to fit (padH & padW).
 * @param {ImgFile[]} imgFiles 
 * @returns {Object} dimensionRefs
 * @returns {number} dimensionRefs.scaleW - The width we'll set each image to
 * @returns {number} dimensionRefs.padH – The height we'll set the mp4 to. If images are smaller, a black frame of padding will added
 * @returns {number} dimensionRefs.padW – The width we'll set the mp4 to. Calculated as scaleW + 2px
 */
const getMp4Dimensions = imgFiles => {
  const scaleW = imgFiles.reduce((min, file) => file.width < min || min === 0 ? file.width : min, 0);
  const padH = imgFiles.reduce((max, file) => {
    const scaledH =  Math.ceil((scaleW / file.width) * file.height);
    return scaledH > max ? scaledH : max;
  }, 0) + 2;
  return {
    scaleW,
    padH,
    padW: scaleW + 2
  }
};

/**
 * Here we take the padding and scaled width from getMp4Dimensions and apply it to each
 * input image. We also set the video format for each image.
 * @param {ffmpeg} ffmpegCmd - an ffmpeg instance with the images already added as inputs
 * @param {number} scaleW 
 * @param {number} padW 
 * @param {number} padH 
 * @returns {ffmpeg} - the same inputted ffmpeg instance with all image options set
 */
const setFfmpegInputOptions = (ffmpegCmd, scaleW, padW, padH) => {
  ffmpegCmd
    .inputFPS('1/3')
    .videoCodec('libx264')
    .videoFilters([
      {
        filter: 'scale',
        options: `${scaleW}:-1`
      },
      {
        filter: 'pad',
        options: `${padW}:${padH}:1:-1:black`
      },
      {
        filter: 'format',
        options: 'yuv420p'
      }
    ])
    .noAudio();
  return ffmpegCmd;
}

/**
 * Run fluen-ffmpeg to convert the image files to an mp4 slideshow
 * @param {ImgFile[]} imgFiles 
 * @param {string} imgDir 
 * @param {string} outputFilePath 
 * @returns {Promise<undefined | Error>}
 */
const convertImagesToMp4 = (imgFiles, imgDir, outputFilePath) => new Promise((resolve, reject) => {
  const { scaleW, padW, padH } = getMp4Dimensions(imgFiles);

  // Instantiate fluent-ffmpeg and add input images using naming pattern (i.e., 1,2,3...)
  const ffmpegCmd = ffmpeg(`${imgDir}/%d.jpg`);

  setFfmpegInputOptions(ffmpegCmd, scaleW, padW, padH)
  
  // Set the output mp4 path, run ffmpeg to create the .mp4, and handle resolution events
  ffmpegCmd
    .output(outputFilePath)
    .on('end', resolve)
    .on('error', (err) => reject(new Error(`Error converting images to slideshow: ${err}`)))
    .run();
});

/**
 * Convert array of images to jpegs and process into mp4 slideshow with each image displayed for 3 seconds. 
 * @param {Object[]} unmappedImgFiles - Each file obj has only one required prop. Any others will be stripped by mapToInterface
 * @param {string} unmappedImgFiles[].path - Imgs should all be in the same dir (probably a temp dir). Any img in said dir will be added to the mp4. Img extension required.
 * @param {string} outputFilePath - The mp4 will be saved here. Path should have extension .mp4
 * @returns {Promise<undefined | Error>}
 */
const mp4Generator = async (unmappedImgFiles, outputFilePath) => {
  try {
    if (unmappedImgFiles.length < 1) {
      throw new Error('No images selected.');
    }

    const imgFiles = await mapToInterface(unmappedImgFiles);

    const imgDir = getImgDir(imgFiles[0].path);

    for (let i = 0; i < imgFiles.length; i++) {
      const file = imgFiles[i];
      const filename = i + 1;

      if(!isJpeg(file)) {
        await convertFileToJpegAndRename(file.path, imgDir, filename);
      } else {
        renameJpeg(file.path, imgDir, filename)
      }
    }

    await convertImagesToMp4(imgFiles, imgDir, outputFilePath);
  } catch (err) {
    throw err;
  }
};

export default mp4Generator
