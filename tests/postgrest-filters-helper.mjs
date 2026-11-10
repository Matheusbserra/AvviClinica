// Small mock of the real SDK's filter syntax. Keep query behavior in isolated
// integration tests, including JSON paths, instead of silently returning all rows.
export function matchesPostgrestFilters(row,url) {
 for(const [field,filter]of url.searchParams){
  const match=/^(eq|in|lt|gt|lte|gte)\.(.*)$/s.exec(filter);
  if(!match)continue;
  const actual=field.split(/->>?/).reduce((value,key)=>value?.[key],row),[,,value]=match;
  if(actual===undefined||actual===null)return false;
  const text=typeof actual==='object'?JSON.stringify(actual):String(actual);
  if(match[1]==='eq'&&text!==value)return false;
  if(match[1]==='in'&&!value.slice(1,-1).split(',').map(item=>item.replace(/^"|"$/g,'')).includes(text))return false;
  if(match[1]==='lt'&&!(text<value)||match[1]==='gt'&&!(text>value)||match[1]==='lte'&&!(text<=value)||match[1]==='gte'&&!(text>=value))return false;
 }
 return true;
}
