# ofou.github.io

```bash
git clone --recursive https://github.com/getpelican/pelican-plugins
git clone --recursive https://github.com/getpelican/pelican-themes
```

To publish the site, run the following command:

```bash
pelican content -o output -s pelicanconf.py && ghp-import output && git push origin gh-pages
```