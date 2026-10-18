function Logo({ className = "", alt = "ТОК" }) {
  return (
    <>
      <img src="/tok-wordmark.svg" alt={alt} className={className + " tok-logo tok-logo-light"} />
      <img src="/tok-wordmark-dark.svg" alt="" aria-hidden="true" className={className + " tok-logo tok-logo-dark"} />
    </>
  );
}

export default Logo;