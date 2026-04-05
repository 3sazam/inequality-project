import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useLocation, Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// 1. IMPORT YOUR GENERATED MODEL
import { Model } from './IMIP_Placeholder';

// Register the GSAP plugin
gsap.registerPlugin(ScrollTrigger);

// 2. THE GSAP CAMERA CONTROLLER
function CameraAnimator() {
  const { camera } = useThree();

  useEffect(() => {
    // We create a GSAP Timeline linked to our main HTML scroll container
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: "#main-scroll-container", // The HTML element we are tracking
        start: "top top", // Start animation when top of container hits top of viewport
        end: "bottom bottom", // End animation when bottom of container hits bottom of viewport
        scrub: 1, // '1' adds a 1-second smoothing delay to the scroll (buttery smooth)
        snap: {
          // Math: 1 / (Number of Sections - 1)
          // Since we have 3 sections (Intro, Rent, Leftover), we use 1 / 2 (which is 0.5)
          // This forces the scrollbar to snap to 0%, 50%, or 100% progress.
          snapTo: 1 / 2, 
          duration: { min: 0.2, max: 0.8 }, // How fast it snaps into place
          ease: "power1.inOut" // The easing curve of the snap
        }
      }
    });

    // Animate the camera's Y position from 0 down to -20 over the course of the scroll
    tl.to(camera.position, {
      y: -20,
      ease: "none" // We use "none" so the movement is strictly tied to the scroll position
    });

    // Cleanup function to kill the animation if the component unmounts
    return () => {
      tl.kill();
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, [camera]);

  return null;
}

// 3. YOUR MAIN PAGE
export default function MainExperience() {
  const location = useLocation();
  const userInput = location.state?.userInput || '5000';

  return (
    <div style={{ backgroundColor: '#1a1a1a' }}>
      
      {/* 2D Back Button (Fixed on screen) */}
      <div style={{ position: 'fixed', top: 20, left: 20, zIndex: 100 }}>
        <Link to="/" style={{ color: 'white', textDecoration: 'none', background: 'rgba(255, 255, 255, 0.2)', padding: '10px 15px', borderRadius: '5px', fontFamily: 'sans-serif' }}>
          ← Back
        </Link>
      </div>

      {/* THE 3D CANVAS (Fixed strictly in the background) */}
      <div style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 0 }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={2} />
          
          <CameraAnimator />
          <Model /> 
        </Canvas>
      </div>

      {/* THE HTML SCROLL CONTAINER (Sits on top of the Canvas) */}
      {/* We give this an ID so GSAP ScrollTrigger can find it */}
      <div id="main-scroll-container" style={{ position: 'relative', zIndex: 10, width: '100%' }}>
        
        {/* SECTION 1: Top of the page */}
        {/* pointerEvents: 'none' ensures your mouse can still interact with the 3D canvas behind the text if needed later */}
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '10vw', pointerEvents: 'none' }}>
          <h1 style={{ color: 'white', margin: 0 }}>Starting Income: ${userInput}</h1>
          <p style={{ color: 'gray' }}>Scroll down to see where it goes...</p>
        </div>
        
        {/* SECTION 2: Rent & Mortgage */}
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '10vw', pointerEvents: 'none' }}>
          <h1 style={{ color: '#ff5555', margin: 0 }}>Rent & Mortgage</h1>
          <p style={{ color: 'gray' }}>Your cube should be right next to this text!</p>
        </div>

        {/* SECTION 3: What's Left */}
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '10vw', pointerEvents: 'none' }}>
          <h1 style={{ color: '#55ff55', margin: 0 }}>Remaining Balance</h1>
          <p style={{ color: 'gray' }}>End of the line.</p>
        </div>

      </div>
    </div>
  );
}