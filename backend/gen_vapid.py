from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
import base64

def generate_vapid_keys():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    private_bytes = private_key.private_numbers().private_value.to_bytes(32, byteorder='big')
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )

    def base64_url_encode(data):
        return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

    print(f"VAPID_PRIVATE_KEY={base64_url_encode(private_bytes)}")
    print(f"VAPID_PUBLIC_KEY={base64_url_encode(public_bytes)}")

if __name__ == "__main__":
    generate_vapid_keys()
