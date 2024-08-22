const markdownBody = document.querySelector('.markdown-body');

function parseMarkdown(markdownText) {
  // 将Markdown文本解析为HTML字符串
  const htmlString = marked.parse(markdownText);
  // 创建一个临时div元素来容纳解析后的HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;

  // 遍历所有解析后的元素
  Array.from(tempDiv.children).forEach((element) => {
    const siblingElements = Array.from(element.children);

    // 如果没有子元素或只有一个子元素，给父元素添加pending类名
    if (siblingElements.length <= 1) {
      element.classList.add('pending');
    } else {
      // 如果存在多个子元素，给它们添加pending类名
      siblingElements.forEach((child) => child.classList.add('pending'));
    }
  });

  return tempDiv;
}

function handlePendingElements(time = 150) {
  const pendingElements = document.querySelectorAll('.pending');
  let currentIndex = 0;

  const interval = setInterval(() => {
    if (currentIndex >= pendingElements.length) {
      clearInterval(interval);
      return;
    }

    const element = pendingElements[currentIndex];
    element.classList.remove('pending');
    element.classList.add('animating');

    // 只在需要的时候添加动画结束事件监听
    element.addEventListener(
      'animationend',
      () => {
        element.removeAttribute('class');
      },
      { once: true }
    );

    currentIndex++;
  }, time);
}

function loadFileByAxios(fileName) {
  return new Promise((resolve, reject) => {
    axios
      .get(`./assets/${fileName}`)
      .then((res) => {
        if (res.status < 400) {
          resolve(res.data);
        }
      })
      .catch((err) => {
        reject(err);
      });
  });
}

loadFileByAxios('RESUME.md').then((res) => {
  const doms = parseMarkdown(res);
  markdownBody.append(...doms.children);
  handlePendingElements(100);
});
