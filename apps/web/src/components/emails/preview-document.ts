/** A natural-height wrapper avoids measuring the iframe's own previous height. */
export function previewDocument(html: string, dark: boolean, selectedId: string | null, selectable: boolean): string {
  const selected = JSON.stringify(selectedId).replace(/</g, "\\u003c");
  const additions = `<style>:root{color-scheme:${dark ? "dark" : "light"}}
    ${dark ? "html,body{background:#14150F}" : ""}
    #joon-email-content{display:flow-root;width:100%}
    ${selectable ? `[data-email-block-id],[data-joon-email-footer]{cursor:pointer;outline-offset:-2px}
      [data-email-block-id]:hover,[data-joon-email-footer]:hover{outline:1px solid #C38A16}
      [data-email-block-id]:focus-visible,[data-joon-email-footer]:focus-visible{outline:2px solid #2D4F9E}
      [data-joon-selected="true"]{outline:2px solid #2D4F9E}` : ""}
  </style><script>
    function setupJoonPreview(){
      var content=document.createElement('div');content.id='joon-email-content';
      while(document.body.firstChild)content.appendChild(document.body.firstChild);
      document.body.appendChild(content);
      function reportHeight(){
        var h=Math.ceil(content.getBoundingClientRect().height)+2;
        if(h>0)parent.postMessage({type:'joon-email-height',height:h},'*');
      }
      reportHeight();
      if(window.ResizeObserver)new ResizeObserver(reportHeight).observe(content);
      window.addEventListener('load',reportHeight);
      ${selectable ? `
        document.querySelectorAll('[data-email-block-id],[data-joon-email-footer]').forEach(function(element){
          element.setAttribute('tabindex','0');element.setAttribute('role','button');
          element.setAttribute('aria-label',element.hasAttribute('data-joon-email-footer')?'Brand footer settings':'Select email block');
          if(${selected}!==null&&element.getAttribute('data-email-block-id')===${selected})element.setAttribute('data-joon-selected','true');
        });
        function selectBlock(event){
          if(event.type==='keydown'&&event.key!=='Enter'&&event.key!==' ')return;
          var element=event.target&&event.target.closest?event.target.closest('[data-email-block-id],[data-joon-email-footer]'):null;
          if(!element)return;
          event.preventDefault();
          parent.postMessage({type:'joon-email-block-select',blockId:element.getAttribute('data-email-block-id')||'__brand_footer'},'*');
        }
        document.addEventListener('keydown',selectBlock,true);
        document.addEventListener('click',selectBlock,true);
      ` : ""}
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupJoonPreview,{once:true});
    else setupJoonPreview();
  </script>`;
  return html.includes("</head>") ? html.replace("</head>", additions + "</head>") : additions + html;
}
