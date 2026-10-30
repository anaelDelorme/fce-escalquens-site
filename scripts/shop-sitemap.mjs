import sitemap from '@astrojs/sitemap';

// Preserve all existing filters, including the team SEO filter when installed.
export default function shopSitemap(options={}){
 return sitemap({...options,filter:page=>!/^\/boutique-[23]\/?$/.test(new URL(page).pathname)&&(!options.filter||options.filter(page))});
}
