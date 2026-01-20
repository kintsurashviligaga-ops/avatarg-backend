// lib/sandbox/testRender.ts

export const SHOTSTACK_TEST_RENDER = {
  timeline: {
    tracks: [
      // Video Track
      {
        clips: [
          {
            asset: {
              type: 'image',
              src: 'https://shotstack-assets.s3.amazonaws.com/images/realestate1.jpg'
            },
            start: 0,
            length: 5,
            transition: {
              in: 'fade',
              out: 'fade'
            },
            effect: 'zoomIn'
          },
          {
            asset: {
              type: 'image',
              src: 'https://shotstack-assets.s3.amazonaws.com/images/realestate2.jpg'
            },
            start: 5,
            length: 5,
            transition: {
              in: 'fade',
              out: 'fade'
            },
            effect: 'slideRight'
          },
          {
            asset: {
              type: 'image',
              src: 'https://shotstack-assets.s3.amazonaws.com/images/realestate3.jpg'
            },
            start: 10,
            length: 5,
            transition: {
              in: 'fade',
              out: 'fade'
            },
            effect: 'zoomOut'
          }
        ]
      },
      // Audio Track
      {
        clips: [
          {
            asset: {
              type: 'audio',
              src: 'https://shotstack-assets.s3.amazonaws.com/music/disco.mp3'
            },
            start: 0,
            length: 15,
            volume: 0.5
          }
        ]
      },
      // Title Track
      {
        clips: [
          {
            asset: {
              type: 'title',
              text: 'Avatar G Test Render',
              style: 'future',
              color: '#ffffff',
              size: 'medium'
            },
            start: 0,
            length: 3,
            transition: {
              in: 'fade',
              out: 'fade'
            },
            position: 'center'
          },
          {
            asset: {
              type: 'title',
              text: 'Sandbox Mode Active',
              style: 'minimal',
              color: '#00ff00',
              size: 'small'
            },
            start: 12,
            length: 3,
            position: 'bottom'
          }
        ]
      }
    ]
  },
  output: {
    format: 'mp4',
    resolution: 'sd',
    fps: 25,
    quality: 'medium'
  }
};

export async function submitTestRender(): Promise<string> {
  const apiKey = process.env.SHOTSTACK_API_KEY;

  if (!apiKey) {
    throw new Error('SHOTSTACK_API_KEY not configured');
  }

  const response = await fetch('https://api.shotstack.io/v1/render', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(SHOTSTACK_TEST_RENDER)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shotstack test render failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.response.id;
}

export async function checkRenderStatus(renderId: string): Promise<{
  status: string;
  url?: string;
  error?: string;
}> {
  const apiKey = process.env.SHOTSTACK_API_KEY;

  if (!apiKey) {
    throw new Error('SHOTSTACK_API_KEY not configured');
  }

  const response = await fetch(`https://api.shotstack.io/v1/render/${renderId}`, {
    headers: {
      'x-api-key': apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    status: data.response.status,
    url: data.response.url,
    error: data.response.error
  };
}
