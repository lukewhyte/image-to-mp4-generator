# Image to mp4 generator

The only file that is likely of value here is [mp4-generator.mjs](mp4-generator.mjs) (using .mjs for the homies). It did my best to add comments and keep it dry.

The other files were pulled together hastily just so that I could do local testing.

## Things to note:

* [ffmpeg](https://ffmpeg.org/) will need to be installed on the machine for the video conversion to work
  * `brew install ffmpeg`
* `mp4Generator` expects an array of images, so we'd need to get stills for video files. I didn't test the module with GIFs but, as things are currently structured, they'd be converted to still images because...
* `ffmpeg` runs extremely slowly when combining and converting images of different file formats. Perhaps someone with more experience could optimize that process but, for this prototype, I opted to just convert all images to JPEGs using [Sharp](https://sharp.pixelplumbing.com/)
  * Sharp supports reading JPEG, PNG, WebP, GIF, AVIF, TIFF and SVG images. Output images can be in JPEG, PNG, WebP, GIF, AVIF and TIFF formats.
