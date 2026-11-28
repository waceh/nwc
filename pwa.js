if ('serviceWorker' in navigator) {
  const workerUrl = new URL('./sw.js', document.currentScript.src)
  navigator.serviceWorker.register(workerUrl).catch(error => {
    console.warn('PWA 서비스 워커 등록 실패:', error)
  })
}
