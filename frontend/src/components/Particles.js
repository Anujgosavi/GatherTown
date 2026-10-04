import React, { useEffect } from 'react';

const Particles = () => {
  useEffect(() => {
    // Original particle animation logic from index.html
    const particlesContainer = document.getElementById('particles');
    const colors = ['#4a6cf7', '#f97b7b', '#02cd82'];
    
    if (particlesContainer) {
      for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.background = colors[i % colors.length];
        particlesContainer.appendChild(particle);
      }
    }
  }, []);

  return <div id="particles" />;
};

export default Particles;